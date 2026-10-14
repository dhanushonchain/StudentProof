"use client";

import Link from "next/link";
import { ProfileMenu, type ProfileMenuUser } from "@/components/profile-menu/profile-menu";

export type DashSection = "home" | "wallet" | "activity";

const navItems: { label: string; section: DashSection | null; href?: string }[] = [
  { label: "Home", section: null, href: "/" },
  { label: "Dashboard", section: "home" },
  { label: "Wallet", section: "wallet" },
  { label: "Activity", section: "activity" },
];

export function DashNavigation({
  currentSection,
  className = "",
  onSelect,
  user,
}: {
  currentSection?: DashSection | null;
  className?: string;
  onSelect: (section: DashSection) => void;
  user: ProfileMenuUser;
}) {
  return (
    <nav
      className={`fixed left-1/2 top-0 z-50 max-w-[calc(100vw-5.5rem)] -translate-x-1/2 sm:max-w-[calc(100vw-2rem)] ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative flex h-8 items-center gap-2 rounded-b-2xl bg-black px-4 md:rounded-b-3xl md:px-8 has-[[aria-expanded=true]]:rounded-br-none">
        <div className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto sm:gap-6 md:gap-12 lg:gap-14">
          {navItems.map((item) => {
            const isActive = item.section === currentSection;
            const commonClass = "shrink-0 text-[10px] transition-colors sm:text-xs md:text-sm";
            const commonStyle = { color: isActive ? "#E1E0CC" : "rgba(225, 224, 204, 0.8)" };

            if (item.href) {
              return (
                <Link key={item.label} href={item.href} className={commonClass} style={commonStyle}>
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onSelect(item.section as DashSection)}
                className={commonClass}
                style={commonStyle}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <ProfileMenu user={user} inline />
      </div>
    </nav>
  );
}
