"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";

// Client actions for /sdk/connect: Google sign-in preserves the full
// authorize parameter set through the OAuth callback URL, and the continue
// link carries the same set to /sdk/authorize. No secrets are involved —
// these are the third-party-supplied request parameters echoed back.
function authorizeUrl(params: {
  mode: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const search = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    mode: params.mode,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  });
  return `/sdk/authorize?${search.toString()}`;
}

export type ConnectFlowParams = {
  mode: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
};

// Card 1 action when a student session already exists: reuse it and continue
// straight to the authorize step — never ask for Google sign-in again.
export function ContinueWithSessionButton(params: ConnectFlowParams) {
  return (
    <Link
      href={authorizeUrl(params)}
      className="flex w-full items-center justify-center gap-3 rounded-xl px-6 py-3 text-sm font-semibold transition hover:opacity-80"
      style={{ background: "#E1E0CC", color: "#050608" }}
    >
      Continue
    </Link>
  );
}

// Card 1 action when anonymous: Google sign-in that returns to this exact
// connect page (same flow parameters), so the fresh session is reused by the
// Continue button above instead of signing in twice.
export function ContinueWithGoogleButton(params: ConnectFlowParams) {
  const callbackUrl = authorizeUrl(params);
  return (
    <button
      onClick={() => signIn("google", { callbackUrl })}
      className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:opacity-80"
    >
      Continue with Google
    </button>
  );
}
