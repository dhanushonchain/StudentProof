"use client";

import { useCallback, useEffect, useState } from "react";
import ApiKeyReveal from "./ApiKeyReveal";

const CREAM = "#E1E0CC";

type ApiKeyRow = {
  id: string;
  label: string;
  keyPrefix: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
};

type KeysState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      keys: ApiKeyRow[];
      usage: { totalCalls: number; callsLast30Days: number };
    };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type KeysData = { keys: ApiKeyRow[]; usage: { totalCalls: number; callsLast30Days: number } };

async function fetchKeysData(): Promise<KeysData> {
  const res = await fetch("/api/developer/keys", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "Sign in again to manage keys." : "Could not load API keys.");
  }
  return (await res.json()) as KeysData;
}

// Self-serve developer dashboard: list, create, and revoke API keys, plus
// per-key and account-level usage. Rendered only for signed-in business
// sessions (see app/sdk/page.tsx). Raw secrets appear exactly once — in the
// create response — and are never fetched or stored client-side beyond that.
export default function DeveloperKeysPanel() {
  const [state, setState] = useState<KeysState>({ status: "loading" });
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const data = await fetchKeysData();
      setState({ status: "ready", keys: data.keys, usage: data.usage });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not load API keys.",
      });
    }
  }, []);

  // Initial load mirrors SdkModalContent's promise-chain style: state updates
  // happen only in async callbacks, never synchronously in the effect body.
  useEffect(() => {
    let cancelled = false;
    fetchKeysData()
      .then((data) => {
        if (cancelled) return;
        setState({ status: "ready", keys: data.keys, usage: data.usage });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            error instanceof Error && error.message !== "Failed to fetch"
              ? error.message
              : "Could not load API keys. Check your connection and retry.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const res = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "Default" }),
      });
      const data = (await res.json()) as { key?: ApiKeyRow; secret?: string; error?: string };
      if (!res.ok || !data.secret) {
        setNotice(data.error ?? "Could not create API key.");
        return;
      }
      setFreshSecret(data.secret);
      setLabel("");
      await reload();
    } catch {
      setNotice("Could not create API key. Check your connection and retry.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string, keyLabel: string) {
    if (revokingId) return;
    if (!window.confirm(`Revoke the key "${keyLabel}"? Calls with it will immediately return 401. This cannot be undone.`)) {
      return;
    }
    setRevokingId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/developer/keys/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      if (!res.ok) {
        setNotice(res.status === 404 ? "API key not found." : "Could not revoke API key.");
        return;
      }
      await reload();
    } catch {
      setNotice("Could not revoke API key. Check your connection and retry.");
    } finally {
      setRevokingId(null);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <p className="text-sm" style={{ color: `${CREAM}85` }}>Loading your API keys…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
        <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>{state.message}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-xl border px-6 py-2.5 text-sm font-medium transition hover:opacity-80"
          style={{ borderColor: `${CREAM}30`, color: CREAM }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
      <h2 className="mb-1 text-lg font-semibold" style={{ color: CREAM }}>
        Your API keys
      </h2>
      <p className="mb-6 text-sm" style={{ color: `${CREAM}85` }}>
        {state.usage.totalCalls} calls all-time · {state.usage.callsLast30Days} in the last 30 days · 60 requests/min per account
      </p>

      {freshSecret && (
        <div className="mb-6 rounded-xl p-4" style={{ border: `1px solid ${CREAM}30`, background: "#09090B" }}>
          <p className="mb-3 text-sm font-medium" style={{ color: CREAM }}>
            New key created — copy it now. This is the only time it will be shown in full.
          </p>
          <ApiKeyReveal apiKey={freshSecret} />
          <button
            type="button"
            onClick={() => setFreshSecret(null)}
            className="mt-3 text-xs underline transition hover:opacity-80"
            style={{ color: `${CREAM}60` }}
          >
            I&apos;ve saved it — dismiss
          </button>
        </div>
      )}

      {notice && (
        <p className="mb-4 text-sm" style={{ color: "#F0A3A3" }}>{notice}</p>
      )}

      {state.keys.length === 0 ? (
        <p className="mb-6 text-sm" style={{ color: `${CREAM}85` }}>
          No dashboard keys yet. Create one below — your original sign-up key (emailed at registration) keeps working.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {state.keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between"
              style={{ border: `1px solid ${CREAM}15`, background: "#09090B" }}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: CREAM }}>
                  {key.label} <span style={{ color: `${CREAM}50` }}>· {key.keyPrefix}…</span>
                </p>
                <p className="mt-1 text-xs" style={{ color: `${CREAM}60` }}>
                  Created {formatDate(key.createdAt)} · {key.usageCount} calls · Last used {formatDate(key.lastUsedAt)} ·{" "}
                  <span style={{ color: key.status === "active" ? "#9FD9A8" : "#F0A3A3" }}>
                    {key.status === "active" ? "Active" : `Revoked ${formatDate(key.revokedAt)}`}
                  </span>
                </p>
              </div>
              {key.status === "active" && (
                <button
                  type="button"
                  disabled={revokingId === key.id}
                  onClick={() => void handleRevoke(key.id, key.label)}
                  className="shrink-0 rounded-xl border px-4 py-2 text-xs font-medium transition hover:opacity-80 disabled:opacity-40"
                  style={{ borderColor: `${CREAM}30`, color: CREAM }}
                >
                  {revokingId === key.id ? "Revoking…" : "Revoke"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Key label, e.g. Production"
          maxLength={60}
          aria-label="New API key label"
          className="flex-1 rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none"
          style={{ borderColor: `${CREAM}25`, color: CREAM }}
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-xl px-6 py-2.5 text-sm font-semibold transition hover:opacity-80 disabled:opacity-40"
          style={{ background: CREAM, color: "#050608" }}
        >
          {creating ? "Creating…" : "Create key"}
        </button>
      </form>
      <p className="mt-3 text-xs" style={{ color: `${CREAM}50` }}>
        Only the hash of each key is stored — StudentProof cannot recover a lost secret. Revoked keys return 401 immediately.
      </p>
    </div>
  );
}
