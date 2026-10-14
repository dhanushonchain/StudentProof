"use client";

// Consent form for /sdk/authorize. Posts every parameter back as hidden
// fields; the server re-validates all of them (client, redirect, PKCE,
// state, session), so tampering with this form can only produce safe
// server-side errors, never a forged authorization.
export function ConsentForm(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  mode: string;
  codeChallenge: string;
}) {
  const hidden = {
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    state: params.state,
    mode: params.mode,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  };

  return (
    <div className="flex flex-col gap-3">
      <form method="POST" action="/api/sdk/authorize">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input type="hidden" name="decision" value="allow" />
        <button
          type="submit"
          className="flex w-full items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold transition hover:opacity-80"
          style={{ background: "#E1E0CC", color: "#050608" }}
        >
          Allow; share my student status
        </button>
      </form>
      <form method="POST" action="/api/sdk/authorize">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input type="hidden" name="decision" value="deny" />
        <button
          type="submit"
          className="w-full rounded-xl border py-3 text-sm font-medium transition hover:opacity-80"
          style={{ borderColor: "#E1E0CC30", color: "#E1E0CC" }}
        >
          Deny
        </button>
      </form>
    </div>
  );
}
