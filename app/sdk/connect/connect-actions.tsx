"use client";

import { signIn } from "next-auth/react";

// Client actions for /sdk/connect: Google sign-in preserves the full
// authorize parameter set through the OAuth callback URL. No secrets are
// involved — these are the third-party-supplied request parameters echoed back.
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

// Always starts a fresh Google OAuth, even when a student session already
// exists. select_account forces the account chooser so the previous Google
// account is never picked silently.
export function ContinueWithGoogleButton(params: ConnectFlowParams) {
  const callbackUrl = authorizeUrl(params);
  return (
    <button
      onClick={() => signIn("google", { callbackUrl }, { prompt: "select_account" })}
      className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:opacity-80"
    >
      Continue with Google
    </button>
  );
}
