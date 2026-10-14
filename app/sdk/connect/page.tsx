import Link from "next/link";
import { getSdkClientByClientId } from "@/lib/sdk-store";
import { assertAuthorizeRequest, parseSdkFlowParams, SdkRequestError } from "@/lib/sdk-validation";
import { ContinueWithGoogleButton } from "./connect-actions";

const CREAM = "#E1E0CC";

function errorCopy(code: string): string {
  switch (code) {
    case "invalid_client":
      return "Unknown application. Check the client_id your integration was given.";
    case "invalid_state":
      return "This authorization request is malformed. Please restart it from the application.";
    default:
      return "This authorization request is invalid. Please restart it from the application.";
  }
}

// Entry point for third-party apps: /sdk/connect?client_id=…&redirect_uri=…
// &state=…&mode=signin|signup&code_challenge=…&code_challenge_method=S256
//
// Only redirects back to the app when redirect_uri is registered AND every
// other parameter fails validation; unknown clients or unregistered
// redirect URIs render a local error card instead (there is nowhere safe
// to send the user).
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  let params: { clientId: string; redirectUri: string; state: string; mode: "signin" | "signup"; codeChallenge: string };
  try {
    params = parseSdkFlowParams(query);
  } catch (error) {
    const code = error instanceof SdkRequestError ? error.message : "invalid_request";
    return <FlowErrorCard copy={errorCopy(code)} />;
  }

  const client = await getSdkClientByClientId(params.clientId);
  if (!client) {
    return <FlowErrorCard copy={errorCopy("invalid_client")} />;
  }

  // Full gate: exact allowlist match + scheme policy. Any failure renders
  // locally — redirecting error details back to the app is reserved for the
  // explicit consent-denial path in POST /api/sdk/authorize, where the
  // redirect URI has already been proven registered.
  try {
    assertAuthorizeRequest({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      state: params.state,
      registeredUris: client.redirectUris,
      env: process.env.NODE_ENV === "production" ? "production" : "development",
    });
  } catch {
    return <FlowErrorCard copy={errorCopy("invalid_redirect")} />;
  }

  const flowParams = {
    mode: params.mode,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    state: params.state,
    codeChallenge: params.codeChallenge,
  };

  const cardStyle = {
    border: `1px solid ${CREAM}15`,
    background: `${CREAM}05`,
  } as const;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-black">
        <div className="p-10 text-center sm:p-12" style={{ background: "#050608", color: CREAM }}>
          <p className="mb-6 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
            {client.name} · StudentProof
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {params.mode === "signup" ? "Create your student credential" : "Sign in with StudentProof"}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-7" style={{ color: `${CREAM}85` }}>
            Verify your student status and unlock student benefits.
          </p>

          <div className="mx-auto mt-8 grid max-w-xl gap-4 text-left sm:grid-cols-2">
            <div className="rounded-2xl p-6" style={cardStyle}>
              <p className="mb-2 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
                Already verified?
              </p>
              <p className="mb-1 text-base font-semibold" style={{ color: CREAM }}>
                Continue with verified email
              </p>
              <p className="mb-5 text-sm leading-7" style={{ color: `${CREAM}85` }}>
                Sign in with Google using the account associated with your existing StudentProof account.
              </p>
              <ContinueWithGoogleButton {...flowParams} />
            </div>

            <div className="rounded-2xl p-6" style={cardStyle}>
              <p className="mb-2 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
                Not verified yet?
              </p>
              <p className="mb-1 text-base font-semibold" style={{ color: CREAM }}>
                Verify my student status
              </p>
              <p className="mb-5 text-sm leading-7" style={{ color: `${CREAM}85` }}>
                Continue to StudentProof to complete verification.
              </p>
              <Link
                href="/dashboard"
                className="flex w-full items-center justify-center gap-3 rounded-xl border px-6 py-3 text-sm font-medium transition hover:opacity-80"
                style={{ borderColor: `${CREAM}30`, color: CREAM }}
              >
                Go to verification
              </Link>
            </div>
          </div>

          <p className="mx-auto mt-6 max-w-md text-xs leading-6" style={{ color: `${CREAM}50` }}>
            Only one fact is ever shared with {client.name}: whether you hold an active
            StudentProof credential. No email, wallet, or ID details leave StudentProof.
          </p>
        </div>
      </div>
    </main>
  );
}

function FlowErrorCard({ copy }: { copy: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl bg-black p-10 text-center sm:p-12" style={{ color: CREAM }}>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Authorization failed</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7" style={{ color: `${CREAM}85` }}>
          {copy}
        </p>
      </div>
    </main>
  );
}
