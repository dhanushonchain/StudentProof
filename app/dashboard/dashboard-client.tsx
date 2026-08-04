"use client";

import { DashNavigation, type DashSection } from "@/components/nav-bar/dash-nav-bar";
import { ProfileMenu } from "@/components/profile-menu/profile-menu";
import { Button } from "@/components/ui/button";
import type { ActivityEventDTO } from "@/lib/activity-db";
import type { CredentialDTO, VerificationDTO } from "@/lib/verification-db";
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
import { type ReactNode, useCallback, useEffect, useState } from "react";

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

  const checkVerificationStatus = useCallback(async () => {
    try {
      const url = sessionId
        ? `/api/verification/status?sessionId=${encodeURIComponent(sessionId)}`
        : "/api/verification/status";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.verification) setVerification(data.verification);
    } catch {
      // Transient network error — the next poll tick or manual click will retry.
    }
  }, [sessionId]);

  // Lives at this level (not inside HomeSection) so polling keeps running even
  // if the user switches to the Wallet/Activity section mid-verification.
  useEffect(() => {
    if (verification?.status !== "pending") {
      setPollTimedOut(false);
      return;
    }

    const startedAt = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setPollTimedOut(true);
        clearInterval(interval);
        return;
      }
      checkVerificationStatus();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // verification?.id (not just status) is a dependency on purpose: retrying
    // creates a new record whose status is still "pending" — the same string
    // as before — so without watching id too, a retry after a timeout would
    // never restart this effect and the timer/pollTimedOut flag would stay stuck.
  }, [verification?.id, verification?.status, checkVerificationStatus]);

  const startVerification = useCallback(async () => {
    // Guards against a double-click (or a fast double-tap on "try again")
    // firing two overlapping POSTs — each would create its own
    // VerificationRecord + Reclaim session, and only one of those sessions is
    // the tab the user actually completes, leaving the other as a stray
    // "pending"/"failed" row that can outrank the real one by createdAt.
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/verification/start", { method: "POST" });
      if (!res.ok) {
        console.error("Failed to start verification");
        return;
      }
      const data = await res.json();
      window.open(data.requestUrl, "_blank", "noopener,noreferrer");
      setSessionId(data.sessionId ?? null);
      setVerification({
        id: data.verificationId,
        status: "pending",
        proofReference: null,
        reclaimSessionId: data.sessionId ?? null,
        verifiedAt: null,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setStarting(false);
    }
  }, [starting]);

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
          onStartVerification={startVerification}
          onCheckStatus={checkVerificationStatus}
        />
      )}

      <video autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover">
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

      {!activeSection && <DashNavigation onSelect={setActiveSection} />}
      <ProfileMenu user={{ name: user.name, image: user.image, email: user.email }} />
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
  onStartVerification,
  onCheckStatus,
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
  onStartVerification: () => void;
  onCheckStatus: () => void;
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
        <DashNavigation currentSection={activeSection} onSelect={onSelect} className="z-[60]" />
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
              onStartVerification={onStartVerification}
              onCheckStatus={onCheckStatus}
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
  onStartVerification,
  onCheckStatus,
}: {
  user: DashboardUser;
  verification: VerificationDTO | null;
  credentials: CredentialDTO[];
  credentialContractAddress: string | null;
  pollTimedOut: boolean;
  onStartVerification: () => void;
  onCheckStatus: () => void;
}) {
  const firstName = user.name.split(" ")[0] || "Dhanush";
  const lastName = user.name.split(" ")[1] || "Doe";

  return (
    <div className="relative flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 pt-10 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-2 pt-0 sm:pt-1">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Welcome, {firstName} {lastName}
          </h1>
        </section>

        <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center">
          <div className="w-full">
            {/* Gate on actually holding a credential, not the latest
                VerificationRecord's status — that row can be a stray/failed
                duplicate session (e.g. a double-submitted "Verify" click)
                even when an earlier attempt in the same batch succeeded and
                already minted. */}
            {credentials.some((c) => c.status === "active") ? (
              <CredentialCard credential={credentials[0] ?? null} contractAddress={credentialContractAddress} />
            ) : verification?.status === "pending" ? (
              <PendingState pollTimedOut={pollTimedOut} onCheckStatus={onCheckStatus} onRetry={onStartVerification} />
            ) : (
              <EmptyState onVerify={onStartVerification} />
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
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  };
  const issuedDate = new Date(credential.issuedAt).toLocaleDateString("en-IN", dateFormat);
  const expiresDate = new Date(credential.expiresAt).toLocaleDateString("en-IN", dateFormat);

  const statusStyles: Record<CredentialDTO["status"], string> = {
    active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    expired: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
    revoked: "border-red-500/30 bg-red-500/10 text-red-400",
  };
  const statusLabel: Record<CredentialDTO["status"], string> = {
    active: "Active",
    expired: "Expired",
    revoked: "Revoked",
  };

  return (
    <section className="flex flex-col items-center rounded-[2rem] border border-[#27272A] bg-[#111113] px-6 py-10 text-center sm:px-10">
      <div className="h-64 w-64 sm:h-80 sm:w-80">
        {/* eslint-disable-next-line @next/next/no-img-element -- external, contract-controlled URL */}
        <img src={CREDENTIAL_IMAGE_URL} alt="Proof of Student credential artwork" className="h-full w-full object-cover" />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <span className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Proof of Student</span>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", statusStyles[credential.status])}>
          {statusLabel[credential.status]}
        </span>
      </div>

      <p className="mt-2 text-sm text-zinc-500">
        Issued {issuedDate} · Expires {expiresDate}
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ActionButton icon={ExternalLink} quiet href={snowtraceUrl ?? undefined} disabled={!snowtraceUrl}>
          View on Blockchain(Snowtrace)
        </ActionButton>
      </div>
    </section>
  );
}

function ActionButton({
  children,
  icon: Icon,
  quiet = false,
  href,
  disabled = false,
}: {
  children: ReactNode;
  icon: LucideIcon;
  quiet?: boolean;
  href?: string;
  disabled?: boolean;
}) {
  const className = cn(
    "h-11 rounded-2xl px-4 focus-visible:ring-[#E1E0CC]",
    quiet
      ? "border-[#27272A] bg-[#09090B] text-zinc-300 hover:bg-[#17171A] hover:text-white"
      : "bg-[#E1E0CC] text-[#09090B] hover:bg-[#f0efdb]",
    disabled && "pointer-events-none opacity-40"
  );

  if (disabled) {
    return (
      <Button type="button" disabled className={className} variant={quiet ? "outline" : "default"}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {children}
      </Button>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(className, "inline-flex items-center justify-center gap-2 text-sm font-medium")}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {children}
      </a>
    );
  }

  return (
    <Button type="button" className={className} variant={quiet ? "outline" : "default"}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </Button>
  );
}

function EmptyState({ onVerify }: { onVerify: () => void }) {
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
        className="mt-8 h-11 rounded-2xl bg-[#E1E0CC] px-6 text-[#09090B] hover:bg-[#f0efdb]"
      >
        Verify Student
      </Button>
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
