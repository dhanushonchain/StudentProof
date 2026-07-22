"use client";

import { DashNavigation, type DashSection } from "@/components/nav-bar/dash-nav-bar";
import { ProfileMenu } from "@/components/profile-menu/profile-menu";
import { Button } from "@/components/ui/button";
import { type ActivityLogEntry, getActivityLog, recordLoginIfNew } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Check, ExternalLink, type LucideIcon, LogIn, LogOut, QrCode, ShieldCheck, Wallet } from "lucide-react";
import { type ReactNode, useState } from "react";

export type DashboardUser = {
  name: string;
  email: string;
  image: string | null;
  walletPublicKey: string | null;
  loginAt: string | null;
};

export default function DashboardClient({ user }: { user: DashboardUser }) {
  const [activeSection, setActiveSection] = useState<DashSection | null>("home");
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090B] text-white antialiased">
      {activeSection && (
        <DashboardModal
          activeSection={activeSection}
          onSelect={setActiveSection}
          onClose={() => setActiveSection(null)}
          user={user}
          verifiedAt={verifiedAt}
          setVerifiedAt={setVerifiedAt}
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
  verifiedAt,
  setVerifiedAt,
}: {
  activeSection: DashSection;
  onSelect: (section: DashSection) => void;
  onClose: () => void;
  user: DashboardUser;
  verifiedAt: string | null;
  setVerifiedAt: (value: string | null) => void;
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
          {activeSection === "home" && <HomeSection user={user} verifiedAt={verifiedAt} setVerifiedAt={setVerifiedAt} />}
          {activeSection === "wallet" && <WalletSection user={user} onClose={onClose} />}
          {activeSection === "activity" && <ActivitySection user={user} verifiedAt={verifiedAt} />}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


function HomeSection({
  user,
  verifiedAt,
  setVerifiedAt,
}: {
  user: DashboardUser;
  verifiedAt: string | null;
  setVerifiedAt: (value: string | null) => void;
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
            {verifiedAt ? <CredentialCard /> : <EmptyState onVerify={() => setVerifiedAt(new Date().toISOString())} />}
          </div>
        </div>
      </div>
    </div>
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

type ActivityEvent = {
  icon: LucideIcon;
  title: string;
  detail: string;
  address?: string;
  timestamp: Date;
};

function ActivitySection({ user, verifiedAt }: { user: DashboardUser; verifiedAt: string | null }) {
  const [authEvents] = useState<ActivityLogEntry[]>(() => {
    if (user.loginAt) recordLoginIfNew(user.email, user.loginAt);
    return getActivityLog(user.email);
  });

  const events: ActivityEvent[] = authEvents.map((entry) => ({
    icon: entry.type === "login" ? LogIn : LogOut,
    title: entry.type === "login" ? "Signed in with Google" : "Signed out",
    detail: user.email,
    timestamp: new Date(entry.timestamp),
  }));

  if (user.walletPublicKey && user.loginAt) {
    events.push({
      icon: Wallet,
      title: "Stellar wallet created",
      detail: "Wallet automatically generated for your account",
      address: user.walletPublicKey,
      timestamp: new Date(user.loginAt),
    });
  }

  if (verifiedAt) {
    events.push({
      icon: ShieldCheck,
      title: "Student credential issued",
      detail: "Verified with Reclaim Protocol",
      address: user.walletPublicKey ?? undefined,
      timestamp: new Date(verifiedAt),
    });
  }

  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

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
            {events.map((event, index) => (
              <li key={index} className="rounded-[1.5rem] border border-[#27272A] bg-[#111113] p-5 sm:p-6">
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

function CredentialCard() {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-[#27272A] bg-[#111113]">
      <div className="relative p-5 sm:p-6">
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Student Credential Issued
                </span>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                Your student proof is verified and reusable across supported applications.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <ActionButton icon={QrCode} quiet>
              View QR Code
            </ActionButton>
            <ActionButton icon={ExternalLink} quiet>
              View on Stellar Explorer
            </ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionButton({
  children,
  icon: Icon,
  quiet = false,
}: {
  children: ReactNode;
  icon: LucideIcon;
  quiet?: boolean;
}) {
  return (
    <Button
      type="button"
      className={cn(
        "h-11 rounded-2xl px-4 focus-visible:ring-[#E1E0CC]",
        quiet
          ? "border-[#27272A] bg-[#09090B] text-zinc-300 hover:bg-[#17171A] hover:text-white"
          : "bg-[#E1E0CC] text-[#09090B] hover:bg-[#f0efdb]"
      )}
      variant={quiet ? "outline" : "default"}
    >
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
          <h3 className="text-lg font-semibold text-white">Your Stellar Wallet</h3>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">Public Key</p>
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
            This wallet was automatically created and will be used for your student credentials on Stellar.
          </p>
        </div>
      </div>
    </section>
  );
}
