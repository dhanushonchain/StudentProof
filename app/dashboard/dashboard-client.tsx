"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  ExternalLink,
  Fingerprint,
  Home,
  type LucideIcon,
  LogOut,
  QrCode,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type DashboardUser = {
  name: string;
  email: string;
  image: string | null;
  walletPublicKey: string | null;
};

const navItems = [
  { label: "Dashboard", icon: Home, active: true },
  { label: "Activity", icon: Activity },
  { label: "Wallet", icon: Wallet },
  { label: "Settings", icon: Settings },
];

export default function DashboardClient({ user }: { user: DashboardUser }) {
  const firstName = user.name.split(" ")[0] || "Dhanush";
  const lastName = user.name.split(" ")[1] || "Doe";
  const [hasVerified, setHasVerified] = useState(false);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#09090B] px-4 pb-6 pt-14 text-white antialiased sm:px-6 lg:px-8">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>

      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.7] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 bg-black/65" />

      <div className="relative z-10 mx-auto flex h-[86vh] w-full max-w-[92rem] overflow-hidden rounded-[2rem] bg-[#09090B]/92 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />

          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8">
            <WelcomeSection firstName={firstName} lastName={lastName} />
            {user.walletPublicKey && <WalletInfoSection walletPublicKey={user.walletPublicKey} />}
            <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] lg:items-start">
              <div>{hasVerified ? <CredentialCard /> : <EmptyState onVerify={() => setHasVerified(true)} />}</div>
              <div className="lg:sticky lg:top-6">
                <ProgressState hasVerified={hasVerified} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 bg-black/25 px-5 py-6 lg:flex lg:flex-col">
      <Link
        href="/"
        className="flex h-12 items-center rounded-2xl px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]"
        aria-label="StudentProof home"
      >
        <Image
          src="/StudentProof.svg"
          alt="StudentProof"
          width={311}
          height={65}
          priority
          className="h-auto w-44"
        />
      </Link>

      <nav className="mt-10 space-y-1" aria-label="Dashboard navigation">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={cn(
              "flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm text-zinc-400 motion-safe:transition-colors motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]",
              item.active && "bg-[#111113] text-[#E1E0CC]",
              !item.active && "hover:bg-[#111113] hover:text-white"
            )}
            type="button"
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function Topbar({ user }: { user: DashboardUser }) {
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
    <header className="sticky top-0 z-20 bg-[#09090B]/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4">
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#27272A] bg-[#111113] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC] lg:hidden"
          aria-label="StudentProof home"
        >
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#27272A] bg-[#111113] text-zinc-400 motion-safe:transition-colors motion-safe:duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]"
            type="button"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-2xl border border-[#27272A] bg-[#111113] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]"
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              onClick={() => setIsProfileMenuOpen((prev) => !prev)}
            >
              {user.image ? (
                <span
                  className="h-7 w-7 rounded-full bg-cover bg-center ring-1 ring-[#27272A]"
                  style={{ backgroundImage: `url(${user.image})` }}
                  aria-label={`${user.name} profile photo`}
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E1E0CC] text-xs font-semibold text-[#09090B]">
                  {initial}
                </span>
              )}
              <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            </button>

            {isProfileMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-40 rounded-xl border border-[#27272A] bg-[#111113] p-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-zinc-200 hover:bg-[#17171A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function WelcomeSection({ firstName, lastName }: { firstName: string; lastName: string }) {
  return (
    <section className="flex flex-col gap-2 pt-0 sm:pt-1">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Welcome, {firstName} {lastName}
        </h1>
      </div>
    </section>
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
