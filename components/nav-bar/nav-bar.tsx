"use client";

import Link from "next/link";

export type AccessPath = "/docs" | "/sdk" | "/api";

const navItems = [
  { label: "DOCS", href: "/docs" },
  { label: "SDK", href: "/sdk" },
  { label: "API", href: "/api" },
  { label: "GitHub", href: "https://github.com/dhanush-devx/StudentProof.git" },
];

export function TopAccessNav({
  currentPath,
  className = "",
  onSelect,
}: {
  currentPath: AccessPath;
  className?: string;
  onSelect?: (path: AccessPath) => void;
}) {
  return (
    <nav
      className={`fixed left-1/2 top-0 z-50 -translate-x-1/2 ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-3 rounded-b-2xl bg-black px-4 py-2 sm:gap-6 md:gap-12 md:rounded-b-3xl md:px-8 lg:gap-14">
        {navItems.map((item) => {
          const isActive = item.href === currentPath;
          const commonClass = "text-[10px] transition-colors sm:text-xs md:text-sm";

          if (item.href.startsWith("http")) {
            return (
              <Link
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={commonClass}
                style={{ color: "rgba(225, 224, 204, 0.8)" }}
              >
                {item.label}
              </Link>
            );
          }

          if (onSelect) {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onSelect(item.href as AccessPath)}
                className={commonClass}
                style={{ color: isActive ? "#E1E0CC" : "rgba(225, 224, 204, 0.8)" }}
              >
                {item.label}
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={commonClass}
              style={{ color: isActive ? "#E1E0CC" : "rgba(225, 224, 204, 0.8)" }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
