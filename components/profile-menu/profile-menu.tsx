"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export type ProfileMenuUser = {
  name: string;
  image: string | null;
  email?: string;
};

// inline: rendered at the right end of a nav pill. The dropdown hangs from the
// pill's bottom edge (top-full) so it reads as part of the nav bar.
export function ProfileMenu({ user, inline = false }: { user: ProfileMenuUser; inline?: boolean }) {
  const initial = user.name.charAt(0).toUpperCase();
  const avatarSize = inline ? "h-5 w-5" : "h-6 w-6";
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
    <div ref={menuRef} className={inline ? undefined : "fixed right-0 top-0 z-[70] w-14"}>
      <button
        type="button"
        className={`flex items-center justify-center gap-0.5 bg-black px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1E0CC] ${
          inline ? "h-8 shrink-0" : "h-10 w-full rounded-bl-2xl py-2"
        }`}
        aria-haspopup="menu"
        aria-expanded={isProfileMenuOpen}
        onClick={() => setIsProfileMenuOpen((prev) => !prev)}
      >
        {user.image ? (
          <span
            className={`${avatarSize} rounded-full bg-cover bg-center`}
            style={{ backgroundImage: `url(${user.image})` }}
            aria-label={`${user.name} profile photo`}
          />
        ) : (
          <span
            className={`flex ${avatarSize} items-center justify-center rounded-full bg-[#E1E0CC] text-[10px] font-semibold text-[#09090B]`}
          >
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
        <div
          role="menu"
          className={
            inline
              ? "absolute right-0 top-full z-30 w-48 overflow-hidden rounded-b-2xl bg-black p-1 pb-2 shadow-xl md:rounded-b-3xl"
              : "absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-2xl bg-black p-1 shadow-xl"
          }
        >
          {user.email ? (
            <p
              className="flex h-8 w-full items-center truncate px-1.5 text-xs"
              style={{ color: "rgba(225, 224, 204, 0.8)" }}
              title={user.email}
            >
              {user.email}
            </p>
          ) : null}
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
