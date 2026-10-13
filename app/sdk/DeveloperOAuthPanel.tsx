"use client";

import { useCallback, useEffect, useState } from "react";
import type { DeveloperOAuthClientDTO } from "@/lib/sdk-client-policy";
import BusinessLoginButton from "@/app/api/auth/BusinessLoginButton";

const CREAM = "#E1E0CC";

type OAuthPanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; clients: DeveloperOAuthClientDTO[] };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type RevealedSecretInfo = {
  clientId: string;
  name: string;
  clientSecret: string;
  isRotation?: boolean;
};

export default function DeveloperOAuthPanel({ businessId }: { businessId?: string | null }) {
  const [state, setState] = useState<OAuthPanelState>(
    businessId ? { status: "loading" } : { status: "ready", clients: [] }
  );
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registerWebsite, setRegisterWebsite] = useState("");
  const [registerCallbacks, setRegisterCallbacks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [revealedSecret, setRevealedSecret] = useState<RevealedSecretInfo | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Edit callback URLs modal state
  const [editingClient, setEditingClient] = useState<DeveloperOAuthClientDTO | null>(null);
  const [editCallbacks, setEditCallbacks] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Action loaders
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!businessId) return;
    try {
      const res = await fetch("/api/developer/oauth-clients", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(
          res.status === 401 ? "Sign in again to manage OAuth applications." : "Could not load applications."
        );
      }
      const data = (await res.json()) as { clients: DeveloperOAuthClientDTO[] };
      setState({ status: "ready", clients: data.clients });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Could not load applications.",
      });
    }
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    fetch("/api/developer/oauth-clients", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load applications.");
        return res.json() as Promise<{ clients: DeveloperOAuthClientDTO[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ status: "ready", clients: data.clients });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof Error && err.message !== "Failed to fetch"
              ? err.message
              : "Could not load applications. Check your connection and retry.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);

    try {
      const callbacks = registerCallbacks
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      const res = await fetch("/api/developer/oauth-clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerName,
          websiteUrl: registerWebsite,
          redirectUris: callbacks,
        }),
      });

      const data = (await res.json()) as {
        client?: DeveloperOAuthClientDTO;
        clientSecret?: string;
        error?: string;
      };

      if (!res.ok || !data.client || !data.clientSecret) {
        setFormError(data.error ?? "Could not register application.");
        return;
      }

      setRevealedSecret({
        clientId: data.client.clientId,
        name: data.client.name,
        clientSecret: data.clientSecret,
        isRotation: false,
      });

      setRegisterName("");
      setRegisterWebsite("");
      setRegisterCallbacks("");
      setShowRegisterForm(false);
      await reload();
    } catch {
      setFormError("Network error. Please check your connection and retry.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditCallbacks(e: React.FormEvent) {
    e.preventDefault();
    if (!editingClient || editSubmitting) return;
    setEditError(null);
    setEditSubmitting(true);

    try {
      const callbacks = editCallbacks
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      const res = await fetch(
        `/api/developer/oauth-clients/${encodeURIComponent(editingClient.clientId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            redirectUris: callbacks,
            websiteUrl: editWebsite,
          }),
        }
      );

      const data = (await res.json()) as { client?: DeveloperOAuthClientDTO; error?: string };

      if (!res.ok || !data.client) {
        setEditError(data.error ?? "Could not update application.");
        return;
      }

      setEditingClient(null);
      await reload();
    } catch {
      setEditError("Network error. Please check your connection and retry.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleRotateSecret(client: DeveloperOAuthClientDTO) {
    if (actionInProgressId) return;
    const confirmMessage = `Rotate client secret for "${client.name}"?\n\nThe current secret will be immediately invalidated. Any backend using it will fail authentication until updated.`;
    if (!window.confirm(confirmMessage)) return;

    setActionInProgressId(client.id);
    setNotice(null);

    try {
      const res = await fetch(
        `/api/developer/oauth-clients/${encodeURIComponent(client.clientId)}/rotate`,
        { method: "POST" }
      );

      const data = (await res.json()) as {
        client?: DeveloperOAuthClientDTO;
        clientSecret?: string;
        error?: string;
      };

      if (!res.ok || !data.clientSecret) {
        setNotice(data.error ?? "Could not rotate secret.");
        return;
      }

      setRevealedSecret({
        clientId: client.clientId,
        name: client.name,
        clientSecret: data.clientSecret,
        isRotation: true,
      });

      await reload();
    } catch {
      setNotice("Network error. Could not rotate secret.");
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleRevoke(client: DeveloperOAuthClientDTO) {
    if (actionInProgressId) return;
    const confirmMessage = `Revoke "${client.name}"?\n\nThis application will immediately lose authorization access. Authorization codes and token exchanges will fail with 401/invalid_client. This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    setActionInProgressId(client.id);
    setNotice(null);

    try {
      const res = await fetch(
        `/api/developer/oauth-clients/${encodeURIComponent(client.clientId)}/revoke`,
        { method: "POST" }
      );

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setNotice(data.error ?? "Could not revoke application.");
        return;
      }

      await reload();
    } catch {
      setNotice("Network error. Could not revoke application.");
    } finally {
      setActionInProgressId(null);
    }
  }

  function copyToClipboard(text: string, fieldId: string) {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <div
      id="oauth-apps"
      className="rounded-2xl p-10"
      style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
            Sign in with StudentProof
          </h2>
          <p className="mt-1 text-sm leading-6" style={{ color: `${CREAM}85` }}>
            Register your website to allow students to authenticate with “Sign in with StudentProof”.
          </p>
        </div>

        {businessId && (
          <button
            type="button"
            onClick={() => {
              setShowRegisterForm((v) => !v);
              setFormError(null);
            }}
            className="shrink-0 rounded-xl px-5 py-2.5 text-sm font-semibold transition hover:opacity-80"
            style={{ background: CREAM, color: "#050608" }}
          >
            {showRegisterForm ? "Close registration" : "Register application"}
          </button>
        )}
      </div>

      {!businessId && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ border: `1px solid ${CREAM}15`, background: "#09090B" }}
        >
          <p className="mb-2 text-base font-semibold" style={{ color: CREAM }}>
            Developer sign-in required
          </p>
          <p className="mx-auto mb-6 max-w-md text-sm leading-6" style={{ color: `${CREAM}75` }}>
            Sign in with Google to self-register your OAuth applications, generate client credentials,
            and configure allowed redirect URIs.
          </p>
          <div className="mx-auto max-w-xs">
            <BusinessLoginButton />
          </div>
        </div>
      )}

      {/* Secret Reveal Modal / Card */}
      {revealedSecret && (
        <div
          className="mb-8 rounded-xl p-6 shadow-xl"
          style={{ border: `1px solid ${CREAM}35`, background: "#09090B" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "#9FD9A8" }}
            />
            <p className="text-sm font-semibold" style={{ color: CREAM }}>
              {revealedSecret.isRotation
                ? `Client secret rotated for "${revealedSecret.name}"`
                : `Application "${revealedSecret.name}" registered successfully`}
            </p>
          </div>
          <p className="mb-5 text-xs leading-5" style={{ color: `${CREAM}80` }}>
            Copy your credentials now. For security, your client secret is stored as a cryptographic hash
            and <strong className="text-white">will never be shown again</strong>.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-1" style={{ color: `${CREAM}60` }}>
                Client ID
              </label>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 rounded-xl p-3 font-mono text-xs break-all"
                  style={{ border: `1px solid ${CREAM}20`, background: "#050608", color: CREAM }}
                >
                  {revealedSecret.clientId}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(revealedSecret.clientId, "revealed-id")}
                  className="shrink-0 rounded-xl border px-3 py-2.5 text-xs font-medium transition hover:opacity-80"
                  style={{ borderColor: `${CREAM}30`, color: CREAM }}
                >
                  {copiedField === "revealed-id" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider mb-1" style={{ color: `${CREAM}60` }}>
                Client Secret (Shown once)
              </label>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 rounded-xl p-3 font-mono text-xs break-all"
                  style={{ border: `1px solid ${CREAM}25`, background: "#050608", color: "#9FD9A8" }}
                >
                  {revealedSecret.clientSecret}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(revealedSecret.clientSecret, "revealed-secret")}
                  className="shrink-0 rounded-xl border px-3 py-2.5 text-xs font-medium transition hover:opacity-80"
                  style={{ borderColor: `${CREAM}30`, color: CREAM }}
                >
                  {copiedField === "revealed-secret" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setRevealedSecret(null)}
              className="text-xs underline transition hover:opacity-80"
              style={{ color: `${CREAM}65` }}
            >
              I&apos;ve safely saved my client credentials — dismiss
            </button>
          </div>
        </div>
      )}

      {/* Registration Form */}
      {businessId && showRegisterForm && (
        <form
          onSubmit={(e) => void handleRegister(e)}
          className="mb-8 rounded-xl p-6"
          style={{ border: `1px solid ${CREAM}25`, background: "#09090B" }}
        >
          <h3 className="text-base font-semibold mb-4" style={{ color: CREAM }}>
            Register new OAuth application
          </h3>

          {formError && (
            <p className="mb-4 rounded-lg p-3 text-xs" style={{ background: "#F0A3A315", color: "#F0A3A3", border: "1px solid #F0A3A330" }}>
              {formError}
            </p>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: CREAM }}>
                Application name <span style={{ color: `${CREAM}50` }}>*</span>
              </label>
              <input
                type="text"
                required
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="e.g. Campus Marketplace"
                maxLength={100}
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition"
                style={{ borderColor: `${CREAM}25`, color: CREAM }}
              />
              <p className="mt-1 text-[11px]" style={{ color: `${CREAM}50` }}>
                The name presented to students on the consent screen.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: CREAM }}>
                Website URL <span style={{ color: `${CREAM}50` }}>*</span>
              </label>
              <input
                type="url"
                required
                value={registerWebsite}
                onChange={(e) => setRegisterWebsite(e.target.value)}
                placeholder="https://example.com or http://localhost:3000"
                maxLength={2000}
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition"
                style={{ borderColor: `${CREAM}25`, color: CREAM }}
              />
              <p className="mt-1 text-[11px]" style={{ color: `${CREAM}50` }}>
                Must be https (or http://localhost during development).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: CREAM }}>
                Allowed OAuth callback URL(s) <span style={{ color: `${CREAM}50` }}>*</span>
              </label>
              <textarea
                required
                rows={3}
                value={registerCallbacks}
                onChange={(e) => setRegisterCallbacks(e.target.value)}
                placeholder={"https://example.com/api/auth/callback\nhttp://localhost:3000/api/auth/callback"}
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-xs outline-none transition leading-5"
                style={{ borderColor: `${CREAM}25`, color: CREAM }}
              />
              <p className="mt-1 text-[11px]" style={{ color: `${CREAM}50` }}>
                One URL per line (or comma-separated). Exact-match allowlist byte-for-byte; no wildcards or open redirects.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowRegisterForm(false);
                setFormError(null);
              }}
              className="rounded-xl border px-4 py-2.5 text-xs font-medium transition hover:opacity-80"
              style={{ borderColor: `${CREAM}25`, color: CREAM }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl px-6 py-2.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-40"
              style={{ background: CREAM, color: "#050608" }}
            >
              {submitting ? "Registering…" : "Register application"}
            </button>
          </div>
        </form>
      )}

      {/* Edit Callback URLs Modal */}
      {editingClient && (
        <div
          className="mb-8 rounded-xl p-6"
          style={{ border: `1px solid ${CREAM}30`, background: "#09090B" }}
        >
          <h3 className="text-base font-semibold mb-2" style={{ color: CREAM }}>
            Manage URLs for {editingClient.name}
          </h3>
          <p className="mb-4 text-xs" style={{ color: `${CREAM}70` }}>
            Client ID: <code className="font-mono">{editingClient.clientId}</code>
          </p>

          {editError && (
            <p className="mb-4 rounded-lg p-3 text-xs" style={{ background: "#F0A3A315", color: "#F0A3A3", border: "1px solid #F0A3A330" }}>
              {editError}
            </p>
          )}

          <form onSubmit={(e) => void handleEditCallbacks(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: CREAM }}>
                Website URL
              </label>
              <input
                type="url"
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 text-sm outline-none transition"
                style={{ borderColor: `${CREAM}25`, color: CREAM }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: CREAM }}>
                Allowed OAuth callback URL(s)
              </label>
              <textarea
                required
                rows={4}
                value={editCallbacks}
                onChange={(e) => setEditCallbacks(e.target.value)}
                className="w-full rounded-xl border bg-transparent px-4 py-2.5 font-mono text-xs outline-none transition leading-5"
                style={{ borderColor: `${CREAM}25`, color: CREAM }}
              />
              <p className="mt-1 text-[11px]" style={{ color: `${CREAM}50` }}>
                One URL per line. Must match your integration&apos;s redirect_uri exactly.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingClient(null);
                  setEditError(null);
                }}
                className="rounded-xl border px-4 py-2.5 text-xs font-medium transition hover:opacity-80"
                style={{ borderColor: `${CREAM}25`, color: CREAM }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="rounded-xl px-6 py-2.5 text-xs font-semibold transition hover:opacity-80 disabled:opacity-40"
                style={{ background: CREAM, color: "#050608" }}
              >
                {editSubmitting ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {notice && (
        <p className="mb-4 rounded-lg p-3 text-xs" style={{ background: "#F0A3A315", color: "#F0A3A3", border: "1px solid #F0A3A330" }}>
          {notice}
        </p>
      )}

      {/* Applications List */}
      {businessId && state.status === "loading" && (
        <div className="py-8 text-center">
          <p className="text-sm" style={{ color: `${CREAM}75` }}>
            Loading your registered applications…
          </p>
        </div>
      )}

      {businessId && state.status === "error" && (
        <div className="rounded-xl p-6 text-center" style={{ border: `1px solid ${CREAM}15`, background: "#09090B" }}>
          <p className="mb-4 text-sm" style={{ color: "#F0A3A3" }}>
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-xl border px-5 py-2 text-xs font-medium transition hover:opacity-80"
            style={{ borderColor: `${CREAM}30`, color: CREAM }}
          >
            Retry
          </button>
        </div>
      )}

      {businessId && state.status === "ready" && (
        <div>
          {state.clients.length === 0 ? (
            <div
              className="rounded-xl p-8 text-center"
              style={{ border: `1px solid ${CREAM}15`, background: "#09090B" }}
            >
              <p className="text-sm" style={{ color: `${CREAM}80` }}>
                No OAuth applications registered yet.
              </p>
              <p className="mt-1 text-xs" style={{ color: `${CREAM}50` }}>
                Click &ldquo;Register application&rdquo; above to get your Client ID and Client Secret.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {state.clients.map((client) => {
                const isActioning = actionInProgressId === client.id;
                const isRevoked = client.status === "revoked";

                return (
                  <li
                    key={client.id}
                    className="rounded-xl p-5"
                    style={{
                      border: `1px solid ${CREAM}15`,
                      background: "#09090B",
                      opacity: isRevoked ? 0.7 : 1,
                    }}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-base font-semibold truncate" style={{ color: CREAM }}>
                            {client.name}
                          </h4>
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background: isRevoked ? "#F0A3A320" : "#9FD9A820",
                              color: isRevoked ? "#F0A3A3" : "#9FD9A8",
                              border: `1px solid ${isRevoked ? "#F0A3A340" : "#9FD9A840"}`,
                            }}
                          >
                            {isRevoked ? `Revoked ${formatDate(client.revokedAt)}` : "Active"}
                          </span>
                        </div>

                        {client.websiteUrl && (
                          <p className="text-xs truncate mb-2" style={{ color: `${CREAM}60` }}>
                            Website:{" "}
                            <a
                              href={client.websiteUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="underline hover:text-white"
                            >
                              {client.websiteUrl}
                            </a>
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono" style={{ color: `${CREAM}60` }}>
                            Client ID:
                          </span>
                          <code
                            className="rounded px-2 py-0.5 font-mono text-xs break-all select-all"
                            style={{ background: "#050608", color: CREAM, border: `1px solid ${CREAM}20` }}
                          >
                            {client.clientId}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(client.clientId, `list-id-${client.id}`)}
                            className="rounded px-2 py-0.5 text-[11px] border transition hover:opacity-80"
                            style={{ borderColor: `${CREAM}30`, color: `${CREAM}80` }}
                          >
                            {copiedField === `list-id-${client.id}` ? "Copied" : "Copy ID"}
                          </button>
                        </div>

                        <div className="mt-3">
                          <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: `${CREAM}50` }}>
                            Allowed callback URLs ({client.redirectUris.length})
                          </p>
                          <ul className="space-y-1">
                            {client.redirectUris.map((uri, idx) => (
                              <li key={idx} className="font-mono text-xs break-all" style={{ color: `${CREAM}80` }}>
                                • {uri}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <p className="mt-3 text-[11px]" style={{ color: `${CREAM}40` }}>
                          Created {formatDate(client.createdAt)}
                        </p>
                      </div>

                      {/* Action buttons */}
                      {!isRevoked && (
                        <div className="flex shrink-0 flex-wrap sm:flex-col items-end gap-2 pt-1">
                          <button
                            type="button"
                            disabled={isActioning}
                            onClick={() => {
                              setEditingClient(client);
                              setEditCallbacks(client.redirectUris.join("\n"));
                              setEditWebsite(client.websiteUrl ?? "");
                              setEditError(null);
                            }}
                            className="rounded-xl border px-3.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-40"
                            style={{ borderColor: `${CREAM}30`, color: CREAM }}
                          >
                            Manage URLs
                          </button>

                          <button
                            type="button"
                            disabled={isActioning}
                            onClick={() => void handleRotateSecret(client)}
                            className="rounded-xl border px-3.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-40"
                            style={{ borderColor: `${CREAM}30`, color: CREAM }}
                          >
                            {isActioning ? "Rotating…" : "Rotate secret"}
                          </button>

                          <button
                            type="button"
                            disabled={isActioning}
                            onClick={() => void handleRevoke(client)}
                            className="rounded-xl border px-3.5 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-40"
                            style={{ borderColor: "#F0A3A340", color: "#F0A3A3" }}
                          >
                            {isActioning ? "Revoking…" : "Revoke"}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="mt-6 text-xs leading-5" style={{ color: `${CREAM}50` }}>
        OAuth client secrets are stored only as SHA-256 hashes. Rotating a secret invalidates the prior secret immediately.
        Revoked applications cannot issue authorization codes or redeem access assertions.
      </p>
    </div>
  );
}
