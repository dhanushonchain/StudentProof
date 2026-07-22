"use client";

import { DashNavigation, type DashSection } from "@/components/nav-bar/dash-nav-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  ExternalLink,
  type LucideIcon,
  LogOut,
  QrCode,
  Settings,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type DashboardUser = {
  name: string;
  email: string;
  image: string | null;
  walletPublicKey: string | null;
};

export default function DashboardClient({ user }: { user: DashboardUser }) {
  const [activeSection, setActiveSection] = useState<DashSection | null>("home");
  const [hasVerified, setHasVerified] = useState(false);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090B] text-white antialiased">
      {activeSection && (
        <DashboardModal
          activeSection={activeSection}
          onSelect={setActiveSection}
          onClose={() => setActiveSection(null)}
          user={user}
          hasVerified={hasVerified}
          setHasVerified={setHasVerified}
        />
      )}

      <video autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover">
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

      {!activeSection && <DashNavigation onSelect={setActiveSection} />}
      <ProfileMenu user={user} />
    </main>
  );
}

function DashboardModal({
  activeSection,
  onSelect,
  onClose,
  user,
  hasVerified,
  setHasVerified,
}: {
  activeSection: DashSection;
  onSelect: (section: DashSection) => void;
  onClose: () => void;
  user: DashboardUser;
  hasVerified: boolean;
  setHasVerified: (value: boolean) => void;
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
        onClick={onClose}
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
            <HomeSection user={user} hasVerified={hasVerified} setHasVerified={setHasVerified} onClose={onClose} />
          )}
          {activeSection === "wallet" && <WalletSection user={user} onClose={onClose} />}
          {activeSection === "activity" && <ActivitySection onClose={onClose} />}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function CloseButton({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="absolute right-5 top-5 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-gray-400 transition hover:bg-white/10 hover:text-white"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

function HomeSection({
  user,
  hasVerified,
  setHasVerified,
  onClose,
}: {
  user: DashboardUser;
  hasVerified: boolean;
  setHasVerified: (value: boolean) => void;
  onClose: () => void;
}) {
  const firstName = user.name.split(" ")[0] || "Dhanush";
  const lastName = user.name.split(" ")[1] || "Doe";

  return (
    <div className="relative flex h-full flex-col">
      <CloseButton onClose={onClose} label="Close dashboard" />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 pt-10 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-2 pt-0 sm:pt-1">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Welcome, {firstName} {lastName}
          </h1>
        </section>

        {user.walletPublicKey && <WalletInfoSection walletPublicKey={user.walletPublicKey} />}

        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] lg:items-start">
          <div>{hasVerified ? <CredentialCard /> : <EmptyState onVerify={() => setHasVerified(true)} />}</div>
          <div className="lg:sticky lg:top-6">
            <ProgressState hasVerified={hasVerified} />
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletSection({ user, onClose }: { user: DashboardUser; onClose: () => void }) {
  return (
    <div className="relative flex h-full flex-col">
      <CloseButton onClose={onClose} label="Close wallet" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Wallet</h1>
        {user.walletPublicKey ? (
          <WalletInfoSection walletPublicKey={user.walletPublicKey} />
        ) : (
          <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-10">
            <p className="text-zinc-400">No wallet has been created for your account yet.</p>
          </section>
        )}
      </div>
    </div>
  );
}

function ActivitySection({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative flex h-full flex-col">
      <CloseButton onClose={onClose} label="Close activity" />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Activity</h1>
        <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-10 text-center">
          <Activity className="mx-auto h-8 w-8 text-[#E1E0CC]" aria-hidden="true" />
          <p className="mt-4 text-zinc-400">No activity yet. Your verification and credential events will show up here.</p>
        </section>
      </div>
    </div>
  );
}

function ProfileMenu({ user }: { user: DashboardUser }) {
  const initial = user.name.charAt(0).toUpperCase();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={menuRef} className="fixed right-0 top-0 z-[70] w-32">
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-center gap-2 bg-black px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]",
          isProfileMenuOpen ? "rounded-bl-2xl" : "rounded-2xl rounded-tr-none"
        )}
        aria-haspopup="menu"
        aria-expanded={isProfileMenuOpen}
        onClick={() => setIsProfileMenuOpen((prev) => !prev)}
      >
        {user.image ? (
          <span
            className="h-6 w-6 rounded-full bg-cover bg-center"
            style={{ backgroundImage: `url(${user.image})` }}
            aria-label={`${user.name} profile photo`}
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E1E0CC] text-[10px] font-semibold text-[#09090B]">
            {initial}
          </span>
        )}
        <ChevronDown
          className="h-3.5 w-3.5 transition-transform"
          style={{ color: "rgba(225, 224, 204, 0.8)", transform: isProfileMenuOpen ? "rotate(180deg)" : undefined }}
          aria-hidden="true"
        />
      </button>

      {isProfileMenuOpen ? (
        <div role="menu" className="w-full overflow-hidden rounded-b-2xl bg-black p-1 shadow-xl">
          <button
            type="button"
            role="menuitem"
            className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-xs transition-colors hover:bg-white/10 hover:text-white"
            style={{ color: "rgba(225, 224, 204, 0.8)" }}
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            Settings
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-xs transition-colors hover:bg-white/10 hover:text-white"
            style={{ color: "rgba(225, 224, 204, 0.8)" }}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Logout
          </button>
        </div>
      ) : null}
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
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-10">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#27272A] bg-[#09090B]">
            <ShieldCheck className="h-8 w-8 text-[#E1E0CC]" />
          </div>

          <h2 className="text-4xl font-semibold tracking-tight text-white">Verify Your Student Identity</h2>
          <p className="mt-5 max-w-lg leading-7 text-zinc-400">
            Verify once using Reclaim Protocol and securely reuse your credential across supported applications.
          </p>
          <Button
            onClick={onVerify}
            className="mt-8 h-11 rounded-2xl bg-[#E1E0CC] px-6 text-[#09090B] hover:bg-[#f0efdb]"
          >
            Verify Student
          </Button>
        </div>
      </div>
    </section>
  );
}

function ProgressState({ hasVerified }: { hasVerified: boolean }) {
  const steps = [
    { label: "Connect Google", done: true },
    { label: "Verify with Reclaim", done: hasVerified },
    { label: "Student Credential Issued", done: hasVerified },
    { label: "Reuse Everywhere", done: false },
  ] as const;

  return (
    <section className="rounded-[2rem] border border-[#27272A] bg-[#111113] p-6 sm:p-8">
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={cn("flex items-center gap-3 text-sm sm:text-base", step.done ? "text-[#E1E0CC]" : "text-zinc-400")}
          >
            <span className="font-medium">{index + 1}.</span>
            <span>{step.label}</span>
            {step.done ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>
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
          <div className="flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#09090B] p-3">
            <code className="flex-1 break-all font-mono text-sm text-[#E1E0CC]">{walletPublicKey}</code>
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
