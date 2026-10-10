"use client";

import { signIn } from "next-auth/react";

// Distinct provider id "google-business" (see auth.config.ts) — same real
// Google OAuth client as the student login button, but a separate NextAuth
// provider so auth.ts's jwt callback can tell the two flows apart and route
// this one to the Business table, never the User table.
export default function BusinessLoginButton() {
  return (
    <button
      onClick={() => signIn("google-business", { callbackUrl: "/sdk" })}
      className="flex w-full items-center justify-center gap-3 rounded-xl px-6 py-3 text-sm font-semibold transition hover:opacity-80"
      style={{ background: "#E1E0CC", color: "#050608" }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
        <path
          fill="#FFC107"
          d="M43.6 20.5H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12S17.4 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
        />
        <path
          fill="#FF3D00"
          d="M6.3 14.7l6.6 4.8C14.7 15.2 18.9 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.2 0 10-2 13.5-5.3l-6.2-5.2c-2.1 1.6-4.7 2.5-7.3 2.5-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.6 39.5 16.2 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.4 5.7-6.2 7.5l6.2 5.2C39.4 37.1 44 31.2 44 24c0-1.3-.1-2.3-.4-3.5z"
        />
      </svg>
      Get API Access (Free Beta)
    </button>
  );
}
