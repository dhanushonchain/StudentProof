"use client";

import { DashNavigation, type DashSection } from "@/components/nav-bar/dash-nav-bar";
import { Button } from "@/components/ui/button";
import type { ActivityEventDTO } from "@/lib/activity-db";
import type { CredentialDTO, VerificationDTO } from "@/lib/verification-db";
import { MAX_ISSUANCE_ATTEMPTS } from "@/lib/issuance-policy";
import {
  deriveVerificationUi,
  isValidDateString,
  shouldKeepPolling,
  startErrorMessage,
  type StartErrorKind,
} from "@/lib/verification-ui";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ExternalLink,
  Loader2,
  type LucideIcon,
  LogIn,
  LogOut,
  QrCode,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export type DashboardUser = {
  name: string;
  email: string;
  image: string | null;
  walletPublicKey: string | null;
  loginAt: string | null;
};

// While a verification is pending, poll for its result every few seconds so a
// live demo doesn't require a manual page refresh. Give up auto-polling after
// a minute — Reclaim's protocol has no signal for "the user closed the tab",
// so a session can sit in a non-terminal state forever with nothing telling
// us it failed. Past the timeout, fall back to a manual "check status" (in
// case it actually finished and we just missed it) and "try again" (starts a
// brand new session) pair of buttons instead of polling forever.
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 60 * 1000;

export default function DashboardClient({
  user,
  activity,
  verification: initialVerification,
  credentials,
  credentialContractAddress,
}: {
  user: DashboardUser;
  activity: ActivityEventDTO[];
  verification: VerificationDTO | null;
  credentials: CredentialDTO[];
  credentialContractAddress: string | null;
}) {
  const [activeSection, setActiveSection] = useState<DashSection | null>("home");
  const [verification, setVerification] = useState<VerificationDTO | null>(initialVerification);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const checkVerificationStatus = useCallback(async () => {
    try {
      const url = sessionId
        ? `/api/verification/status?sessionId=${encodeURIComponent(sessionId)}`
        : "/api/verification/status";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      // Guard malformed payloads: a missing/invalid verification object must
      // never wipe or corrupt the current state.
      if (mountedRef.current && data && typeof data.verification === "object" && data.verification !== null) {
        setVerification(data.verification as VerificationDTO);
      }
    } catch {
      // Transient network error — persisted state is untouched; the next
      // poll tick or manual click will retry. Never downgrade to failed here.
    }
  }, [sessionId]);

  // Backend is the source of truth: refetch on mount so refreshes, tab
  // switches, and returns from the Reclaim flow reconstruct state from
  // persisted data instead of stale in-memory state. Deferred a tick so the
  // fetch runs outside the render-commit phase.
  useEffect(() => {
    const timer = setTimeout(() => {
      checkVerificationStatus();
    }, 0);
    return () => clearTimeout(timer);
  }, [checkVerificationStatus]);

  // Single boolean for the poll effect below: depending on the whole
  // verification object would restart the 60-second timer on every poll
  // response (new object identity), so the timeout could never fire.
  // shouldPoll flips only on real state transitions.
  const shouldPoll = shouldKeepPolling(verification);

  // Lives at this level (not inside HomeSection) so polling keeps running even
  // if the user switches to the Wallet/Activity section mid-verification.
  // Polls while the proof is pending and while a verified proof still has
  // issuance pending (see shouldKeepPolling) — the status endpoint is
  // side-effect-free for verified records, so these ticks only re-read.
  // Stops on issued/failed issuance, failed verification, timeout, unmount.
  useEffect(() => {
    if (!shouldPoll) {
      setPollTimedOut(false);
      return;
    }

    const startedAt = Date.now();
    let inFlight = false;
    const interval = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setPollTimedOut(true);
        clearInterval(interval);
        return;
      }
      // Skip ticks while a previous poll is still outstanding — avoids
      // overlapping requests without blocking manual refresh/retry buttons.
      if (inFlight) return;
      inFlight = true;
      void checkVerificationStatus().finally(() => {
        inFlight = false;
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // verification id is a dependency on purpose: retrying creates a new
    // record whose derived poll flag matches the old one, so without the id
    // a retry after a timeout would never restart this effect and the
    // timer/pollTimedOut flag would stay stuck. shouldPoll flips on every
    // other relevant transition (pending/verified/issued/failed) without
    // resetting the 60-second bound on ticks that change nothing.
  }, [verification?.id, shouldPoll, checkVerificationStatus]);

  const startVerification = useCallback(async () => {
    // Guards against a double-click (or a fast double-tap on "try again")
    // firing two overlapping POSTs — each would create its own
    // VerificationRecord + Reclaim session, and only one of those sessions is
    // the tab the user actually completes, leaving the other as a stray
    // "pending"/"failed" row that can outrank the real one by createdAt.
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/verification/start", { method: "POST" });
      if (!res.ok) {
        // The start route returns safe, displayable copy on failure — prefer
        // it, and only fall back to a fixed message when it is absent.
        let kind: StartErrorKind = "server";
        let copy: string | null = null;
        if (res.status === 401) {
          kind = "unauthorized";
        } else {
          try {
            const data = await res.json();
            if (data && typeof data.error === "string" && data.error.length > 0) {
              copy = data.error;
            }
          } catch {
            // Non-JSON error body — fall through to the fixed copy.
          }
        }
        setStartError(copy ?? startErrorMessage(kind));
        return;
      }
      const data = await res.json();
      if (!data || typeof data.requestUrl !== "string") {
        setStartError(startErrorMessage("server"));
        return;
      }
      window.open(data.requestUrl, "_blank", "noopener,noreferrer");
      setSessionId(typeof data.sessionId === "string" ? data.sessionId : null);
      setPollTimedOut(false);
      setVerification({
        id: data.verificationId,
        status: "pending",
        proofReference: null,
        reclaimSessionId: typeof data.sessionId === "string" ? data.sessionId : null,
        verifiedAt: null,
        createdAt: new Date().toISOString(),
        issuance: {
          status: "not_started",
          attempts: 0,
          attemptsRemaining: MAX_ISSUANCE_ATTEMPTS,
          retryAllowed: false,
          message: null,
          txHash: null,
        },
      });
    } catch {
      setStartError(startErrorMessage("network"));
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }, [starting]);

  const retryIssuance = useCallback(async () => {
    // Same double-activation guard as startVerification: the backend claim
    // would serialize duplicates anyway, but the button must not invite them.
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch("/api/verification/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        let copy = "Issuance retry failed. Try again in a moment.";
        try {
          const data = await res.json();
          if (data && typeof data.error === "string" && data.error.length > 0) {
            copy = data.error;
          }
        } catch {
          // Non-JSON error body — keep the fallback copy.
        }
        setRetryError(copy);
        return;
      }
      // Reload the canonical record: the retry response carries the outcome,
      // but the persisted DTO (with server-computed retry verdict) is what
      // the UI renders from.
      await checkVerificationStatus();
    } catch {
      setRetryError("Could not reach the server. Your verification is safe — try again.");
    } finally {
      if (mountedRef.current) setRetrying(false);
    }
  }, [retrying, checkVerificationStatus]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090B] text-white antialiased">
      {activeSection && (
        <DashboardModal
          activeSection={activeSection}
          onSelect={setActiveSection}
          onClose={() => setActiveSection(null)}
          user={user}
          activity={activity}
          verification={verification}
          credentials={credentials}
          credentialContractAddress={credentialContractAddress}
          pollTimedOut={pollTimedOut}
          starting={starting}
          startError={startError}
          retrying={retrying}
          retryError={retryError}
          onStartVerification={startVerification}
          onCheckStatus={checkVerificationStatus}
          onRetryIssuance={retryIssuance}
        />
      )}

      <video autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover">
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

      {!activeSection && (
        <DashNavigation onSelect={setActiveSection} user={{ name: user.name, image: user.image, email: user.email }} />
      )}
    </main>
  );
}

function DashboardModal({
  activeSection,
  onSelect,
  onClose,
  user,
  activity,
  verification,
  credentials,
  credentialContractAddress,
  pollTimedOut,
  starting,
  startError,
  retrying,
  retryError,
  onStartVerification,
  onCheckStatus,
  onRetryIssuance,
}: {
  activeSection: DashSection;
  onSelect: (section: DashSection) => void;
  onClose: () => void;
  user: DashboardUser;
  activity: ActivityEventDTO[];
  verification: VerificationDTO | null;
  credentials: CredentialDTO[];
  credentialContractAddress: string | null;
  pollTimedOut: boolean;
  starting: boolean;
  startError: string | null;
  retrying: boolean;
  retryError: string | null;
  onStartVerification: () => void;
  onCheckStatus: () => void;
  onRetryIssuance: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        key="dash-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-6 pb-4 pt-12"
        style={{ backdropFilter: "blur(1px)" }}
        onClick={activeSection === "home" ? undefined : onClose}
      >
        <DashNavigation
          currentSection={activeSection}
          onSelect={onSelect}
          className="z-[60]"
          user={{ name: user.name, image: user.image, email: user.email }}
        />
        <motion.div
          key="dash-modal-card"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 h-[86vh] w-full max-w-[92rem] overflow-hidden rounded-3xl bg-[#09090B]"
          onClick={(e) => e.stopPropagation()}
        >
          {activeSection === "home" && (
            <HomeSection
              user={user}
              verification={verification}
              credentials={credentials}
              credentialContractAddress={credentialContractAddress}
              pollTimedOut={pollTimedOut}
              starting={starting}
              startError={startError}
              retrying={retrying}
              retryError={retryError}
              onStartVerification={onStartVerification}
              onCheckStatus={onCheckStatus}
              onRetryIssuance={onRetryIssuance}
            />
          )}
          {activeSection === "wallet" && <WalletSection user={user} onClose={onClose} />}
          {activeSection === "activity" && <ActivitySection user={user} activity={activity} />}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


function HomeSection({
  user,
  verification,
  credentials,
  credentialContractAddress,
  pollTimedOut,
  starting,
  startError,
  retrying,
  retryError,
  onStartVerification,
  onCheckStatus,
  onRetryIssuance,
}: {
  user: DashboardUser;
  verification: VerificationDTO | null;
  credentials: CredentialDTO[];
  credentialContractAddress: string | null;
  pollTimedOut: boolean;
  starting: boolean;
  startError: string | null;
  retrying: boolean;
  retryError: string | null;
  onStartVerification: () => void;
  onCheckStatus: () => void;
  onRetryIssuance: () => void;
}) {
  const firstName = user.name.split(" ")[0] || "Dhanush";
  const lastName = user.name.split(" ")[1] || "Doe";
  // Backend DTOs in, UI state out — verification and issuance are never
  // conflated (see lib/verification-ui.ts).
  const uiState = deriveVerificationUi(verification, credentials);

  return (
    <div className="relative flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 pt-10 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-2 pt-0 sm:pt-1">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Welcome, {firstName} {lastName}
          </h1>
        </section>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 py-4">
          <div className="w-full" role="status" aria-live="polite">
            {uiState.kind === "issued" && (
              <CredentialCard credential={uiState.credential} contractAddress={credentialContractAddress} />
            )}
            {uiState.kind === "proof_pending" && (
              <PendingState pollTimedOut={pollTimedOut} onCheckStatus={onCheckStatus} onRetry={onStartVerification} />
            )}
            {uiState.kind === "proof_failed" && (
              <ProofFailedState starting={starting} onRetry={onStartVerification} />
            )}
            {(uiState.kind === "unverified" || uiState.kind === "verified_no_active_credential") && (
              <EmptyState
                starting={starting}
                startError={startError}
                onVerify={onStartVerification}
                notice={
                  uiState.kind === "verified_no_active_credential"
                    ? uiState.detail === "expired"
                      ? "Your previous credential expired. Verify again to get a renewed one."
                      : uiState.detail === "revoked"
                        ? "Your previous credential was revoked. Verify again to get a renewed one."
                        : "Your verification is complete but no credential is showing. Refresh, or verify again."
                    : null
                }
              />
            )}
            {uiState.kind === "issuing" && (
              <IssuingState message={uiState.message} onRefresh={onCheckStatus} />
            )}
            {uiState.kind === "issuance_failed" && (
              <IssuanceFailedState
                message={uiState.message}
                retryAllowed={uiState.retryAllowed}
                retrying={retrying}
                retryError={retryError}
                onRetry={onRetryIssuance}
                onRefresh={onCheckStatus}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingState({
  pollTimedOut,
  onCheckStatus,
  onRetry,
}: {
  pollTimedOut: boolean;
  onCheckStatus: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 text-center sm:p-8 md:p-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#27272A] bg-[#09090B]">
        <Loader2 className="h-8 w-8 animate-spin text-[#E1E0CC]" aria-hidden="true" />
      </div>
      <h3 className="mt-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {pollTimedOut ? "Didn't hear back in time" : "Verification in progress"}
      </h3>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-zinc-400">
        {pollTimedOut
          ? "This can happen if the SAMARTH login tab was closed early, the session expired, or it's just slow. Check status in case it actually finished, or start over."
          : "Complete the SAMARTH login in the tab that just opened. This page will update automatically once it's done."}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          onClick={onCheckStatus}
          className="h-11 rounded-2xl border-[#27272A] bg-[#09090B] px-6 text-zinc-300 hover:bg-[#17171A] hover:text-white"
          variant="outline"
        >
          Check status
        </Button>
        {pollTimedOut && (
          <Button onClick={onRetry} className="h-11 rounded-2xl bg-[#E1E0CC] px-6 text-[#09090B] hover:bg-[#f0efdb]">
            Try again
          </Button>
        )}
      </div>
    </section>
  );
}

function ProofFailedState({ starting, onRetry }: { starting: boolean; onRetry: () => void }) {
  return (
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 text-center sm:p-8 md:p-10">
      <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Verification failed</h3>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-zinc-400">
        We couldn&apos;t confirm your student status from that session — the login may have expired, been
        cancelled, or not shown the expected programme page. Your account is unchanged; nothing was issued.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          onClick={onRetry}
          disabled={starting}
          aria-label={starting ? "Starting verification" : "Try verification again"}
          className="h-11 rounded-2xl bg-[#E1E0CC] px-6 text-[#09090B] hover:bg-[#f0efdb] disabled:opacity-60"
        >
          {starting ? "Starting…" : "Try again"}
        </Button>
      </div>
    </section>
  );
}

function IssuingState({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  return (
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 text-center sm:p-8 md:p-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#27272A] bg-[#09090B]">
        <Loader2 className="h-8 w-8 animate-spin text-[#E1E0CC]" aria-hidden="true" />
      </div>
      <h3 className="mt-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Issuing your credential</h3>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-zinc-400">{message}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button
          onClick={onRefresh}
          aria-label="Refresh credential status"
          className="h-11 rounded-2xl border-[#27272A] bg-[#09090B] px-6 text-zinc-300 hover:bg-[#17171A] hover:text-white"
          variant="outline"
        >
          Refresh status
        </Button>
      </div>
    </section>
  );
}

function IssuanceFailedState({
  message,
  retryAllowed,
  retrying,
  retryError,
  onRetry,
  onRefresh,
}: {
  message: string;
  retryAllowed: boolean;
  retrying: boolean;
  retryError: string | null;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 text-center sm:p-8 md:p-10">
      <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Issuance needs a retry</h3>
      <p className="mx-auto mt-3 max-w-lg leading-7 text-zinc-400">{message}</p>
      {retryError && (
        <p role="alert" className="mx-auto mt-3 max-w-lg text-sm leading-6 text-red-300">
          {retryError}
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {retryAllowed ? (
          <Button
            onClick={onRetry}
            disabled={retrying}
            aria-label={retrying ? "Retrying issuance" : "Retry credential issuance"}
            className="h-11 rounded-2xl bg-[#E1E0CC] px-6 text-[#09090B] hover:bg-[#f0efdb] disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Retry issuance"}
          </Button>
        ) : (
          <p className="w-full text-sm text-zinc-500">Automatic retries are exhausted — contact support.</p>
        )}
        <Button
          onClick={onRefresh}
          aria-label="Refresh credential status"
          className="h-11 rounded-2xl border-[#27272A] bg-[#09090B] px-6 text-zinc-300 hover:bg-[#17171A] hover:text-white"
          variant="outline"
        >
          Refresh status
        </Button>
      </div>
    </section>
  );
}

function WalletSection({ user, onClose }: { user: DashboardUser; onClose: () => void }) {
  return (
    <div className="relative flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Wallet</h1>
        {user.walletPublicKey ? (
          <WalletInfoSection walletPublicKey={user.walletPublicKey} />
        ) : (
          <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 sm:p-8 md:p-10">
            <p className="text-zinc-400">No wallet has been created for your account yet.</p>
          </section>
        )}
      </div>
    </div>
  );
}

const EVENT_DISPLAY: Record<string, { icon: LucideIcon; title: string }> = {
  login: { icon: LogIn, title: "Signed in with Google" },
  logout: { icon: LogOut, title: "Signed out" },
  wallet_created: { icon: Wallet, title: "Avalanche wallet created" },
  verification_completed: { icon: ShieldCheck, title: "Verification completed" },
  credential_issued: { icon: ShieldCheck, title: "Student credential issued" },
};

function ActivitySection({ user, activity }: { user: DashboardUser; activity: ActivityEventDTO[] }) {
  const events = activity.map((event) => {
    const display = EVENT_DISPLAY[event.eventType] ?? { icon: Activity, title: event.eventType };
    const isWalletCreated = event.eventType === "wallet_created";

    return {
      icon: display.icon,
      title: display.title,
      detail: isWalletCreated ? "Wallet automatically generated for your account" : user.email,
      address: isWalletCreated ? (user.walletPublicKey ?? undefined) : undefined,
      timestamp: new Date(event.timestamp),
      key: event.id,
    };
  });

  return (
    <div className="relative flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Activity</h1>

        {events.length === 0 ? (
          <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 text-center sm:p-8 md:p-10">
            <Activity className="mx-auto h-8 w-8 text-[#E1E0CC]" aria-hidden="true" />
            <p className="mt-4 text-zinc-400">No activity yet. Your verification and credential events will show up here.</p>
          </section>
        ) : (
          <ol className="flex flex-col gap-3">
            {events.map((event) => (
              <li key={event.key} className="rounded-[1.5rem] border border-[#27272A] bg-[#111113] p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#27272A] bg-[#09090B]">
                    <event.icon className="h-4 w-4 text-[#E1E0CC]" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <h3 className="text-sm font-semibold text-white sm:text-base">{event.title}</h3>
                      <time className="shrink-0 text-xs text-zinc-500">
                        {event.timestamp.toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "Asia/Kolkata",
                        })}{" "}
                        ·{" "}
                        {event.timestamp.toLocaleTimeString("en-IN", {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "Asia/Kolkata",
                        })}{" "}
                        IST
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{event.detail}</p>
                    {event.address && (
                      <code className="mt-2 block truncate font-mono text-xs text-[#E1E0CC]">{event.address}</code>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

const CREDENTIAL_IMAGE_URL = "https://studentproof.app/nft/pos-nft.png";

function CredentialCard({
  credential,
  contractAddress,
}: {
  credential: CredentialDTO | null;
  contractAddress: string | null;
}) {
  if (!credential) {
    // Verification succeeded but minting hasn't landed yet (or failed) — the
    // off-chain status and on-chain credential are tracked separately on
    // purpose (see lib/verification-db.ts markVerified), so this state is
    // real and expected, not an error.
    return (
      <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 text-center sm:p-8 md:p-10">
        <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Verification Complete</h3>
        <p className="mx-auto mt-3 max-w-lg leading-7 text-zinc-400">
          Your credential is being issued on-chain. This can take a moment — refresh shortly.
        </p>
      </section>
    );
  }

  // Always the NFT's own token page — contractAddress + tokenId, never the
  // wallet or bare contract address — and always the live, currently
  // configured contract (see the comment in app/dashboard/page.tsx), not
  // whatever happens to be stored on this Credential row.
  const snowtraceUrl =
    contractAddress && credential.tokenId
      ? `https://testnet.snowtrace.io/nft/${contractAddress}/${credential.tokenId}?chainid=43113&type=erc721`
      : null;
  const dateFormat: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  };
  const issuedDate = isValidDateString(credential.issuedAt)
    ? new Date(credential.issuedAt).toLocaleDateString("en-IN", dateFormat)
    : "—";
  const expiresDate = isValidDateString(credential.expiresAt)
    ? new Date(credential.expiresAt).toLocaleDateString("en-IN", dateFormat)
    : "—";

  const statusDotColor: Record<CredentialDTO["status"], string> = {
    active: "bg-emerald-500",
    expired: "bg-zinc-500",
    revoked: "bg-red-500",
  };
  const statusLabel: Record<CredentialDTO["status"], string> = {
    active: "Active",
    expired: "Expired",
    revoked: "Revoked",
  };

  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#27272A] bg-[#111113]">
      <div className="flex flex-col items-center px-6 pb-2 pt-10 text-center sm:px-10">
        <div className="h-48 w-48 overflow-hidden rounded-2xl sm:h-56 sm:w-56">
          {/* eslint-disable-next-line @next/next/no-img-element -- external, contract-controlled URL */}
          <img src={CREDENTIAL_IMAGE_URL} alt="Verified student credential artwork" className="h-full w-full object-cover" />
        </div>
        <span className="mt-6 text-xl font-semibold tracking-tight text-white">Verified Student</span>
      </div>

      <dl className="divide-y divide-[#27272A] px-6 py-2 sm:px-10">
        <CredentialRow label="Verified by" value="StudentProof" />
        <CredentialRow label="Issued" value={issuedDate} />
        <CredentialRow label="Expires" value={expiresDate} />
        <CredentialRow
          label="Status"
          value={
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", statusDotColor[credential.status])} aria-hidden="true" />
              {statusLabel[credential.status]}
            </span>
          }
        />
        <CredentialRow
          label="Blockchain"
          value={
            snowtraceUrl ? (
              <a
                href={snowtraceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[#E1E0CC] hover:underline"
              >
                View on Snowtrace
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              "Unavailable"
            )
          }
        />
      </dl>
    </section>
  );
}

function CredentialRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-zinc-200">{value}</dd>
    </div>
  );
}

function EmptyState({
  starting,
  startError,
  notice,
  onVerify,
}: {
  starting: boolean;
  startError: string | null;
  notice: string | null;
  onVerify: () => void;
}) {
  return (
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 text-center sm:p-8 md:p-10">
      <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl md:whitespace-nowrap md:text-4xl">
        Verify Your Student Identity
      </h3>
      <p className="mx-auto mt-5 max-w-lg leading-7 text-zinc-400">
        Verify once using Reclaim Protocol and securely reuse your credential across supported applications.
      </p>
      <ol className="mx-auto mt-6 max-w-md space-y-3 text-left text-sm leading-6 text-zinc-400">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1c1c1f] text-xs font-medium text-[#E1E0CC]">
            1
          </span>
          <span>
            A new tab opens to SAMARTH — log in with your Enrolment Number and password.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1c1c1f] text-xs font-medium text-[#E1E0CC]">
            2
          </span>
          <span>
            On the SAMARTH Dashboard, find your programme card and click <strong className="text-zinc-200">CLICK HERE</strong>.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1c1c1f] text-xs font-medium text-[#E1E0CC]">
            3
          </span>
          <span>
            Stay on the Programme Details page that loads — don&apos;t navigate away. Verification captures automatically within a few seconds.
          </span>
        </li>
      </ol>
      <Button
        onClick={onVerify}
        disabled={starting}
        aria-label={starting ? "Starting verification" : "Verify student identity"}
        className="mt-8 h-11 rounded-2xl bg-[#E1E0CC] px-6 text-[#09090B] hover:bg-[#f0efdb] disabled:opacity-60"
      >
        {starting ? "Starting…" : "Verify Student"}
      </Button>
      {notice && <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-zinc-400">{notice}</p>}
      {startError && (
        <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-red-900/60 bg-red-950/40 p-4">
          <p role="alert" className="text-sm leading-6 text-red-200">
            {startError}
          </p>
          <Button
            onClick={onVerify}
            disabled={starting}
            aria-label="Retry starting verification"
            className="mt-3 h-10 rounded-xl border-[#27272A] bg-[#09090B] px-5 text-sm text-zinc-200 hover:bg-[#17171A] hover:text-white"
            variant="outline"
          >
            Try again
          </Button>
        </div>
      )}
    </section>
  );
}

function WalletInfoSection({ walletPublicKey }: { walletPublicKey: string }) {
  return (
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 sm:p-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-5 w-5 text-[#E1E0CC]" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-white">Your Avalanche Wallet</h3>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">Wallet Address</p>
          <div className="flex flex-col items-start gap-2 rounded-lg border border-[#27272A] bg-[#09090B] p-3 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all font-mono text-sm text-[#E1E0CC]">{walletPublicKey}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(walletPublicKey);
              }}
              className="shrink-0 rounded-lg border border-[#27272A] bg-[#111113] px-3 py-2 text-xs text-zinc-300 hover:bg-[#17171A] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]"
              title="Copy to clipboard"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            This wallet was automatically created and will be used for your student credentials on Avalanche.
          </p>
        </div>
      </div>
    </section>
  );
}
