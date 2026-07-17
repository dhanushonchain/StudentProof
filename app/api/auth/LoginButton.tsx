"use client";

import { signIn } from "next-auth/react";

export default function LoginButton() {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      className="px-6 py-2 rounded-full bg-white text-black text-xs hover:bg-white/90"
    >
      Login
    </button>
  );
}