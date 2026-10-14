"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ProfileMenuUser = {
  name: string;
  image: string | null;
  email?: string;
};

export function ProfileMenu({ user }: { user: ProfileMenuUser }) {
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
    <div ref={menuRef} className="fixed right-0 top-0 z-[70] w-14">
      <button
        type="button"
        className="flex h-10 w-full items-center justify-center gap-0.5 rounded-bl-2xl bg-black px-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC]"
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
        <div role="menu" className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-2xl bg-black p-1 shadow-xl">
          {user.email ? (
            <p
              className="flex h-8 w-full items-center truncate px-1.5 text-xs"
              style={{ color: "rgba(225, 224, 204, 0.8)" }}
              title={user.email}
            >
              {user.email}
            </p>
          ) : null}
          <Link
            href="/pricing"
            role="menuitem"
            className="flex h-8 w-full items-center rounded-xl px-1.5 text-left text-xs transition-colors hover:bg-white/10 hover:text-white"
            style={{ color: "rgba(225, 224, 204, 0.8)" }}
          >
            Pricing
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await fetch("/api/activity/logout", { method: "POST" }).catch(() => {});
              signOut({ callbackUrl: "/" });
            }}
            className="flex h-8 w-full items-center gap-1.5 rounded-xl px-1.5 text-left text-xs transition-colors hover:bg-white/10 hover:text-white"
            style={{ color: "rgba(225, 224, 204, 0.8)" }}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
