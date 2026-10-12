import { auth } from "@/auth";
import { hasValidCredential } from "@/lib/credential-contract";
import { findSdkUserByWallet, getSdkClientByClientId } from "@/lib/sdk-store";
import { assertAuthorizeRequest, parseSdkFlowParams, resolveCredentialGate } from "@/lib/sdk-validation";
import type { Address } from "viem";
import { ConsentForm } from "./consent-form";

const CREAM = "#E1E0CC";

function ErrorCard({ title, copy }: { title: string; copy: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl bg-black p-10 text-center sm:p-12" style={{ color: CREAM }}>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7" style={{ color: `${CREAM}85` }}>
          {copy}
        </p>
      </div>
    </main>
  );
}

// Shown when the student is verified but holds no active credential: no
// redirect happens here (nothing consented yet), so the student returns to
// the app manually after verifying on StudentProof.
function VerificationRequiredCard({ mode }: { mode: string }) {
  return (
    <ErrorCard
      title="No active credential"
      copy={
        mode === "signup"
          ? "Complete verification on your StudentProof dashboard first — then return here through the application to share your new credential."
          : "This account holds no active StudentProof credential, so there is nothing to share yet. Verify on your dashboard, then try again."
      }
    />
  );
}

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  let params;
  try {
    params = parseSdkFlowParams(query);
  } catch {
    return <ErrorCard title="Authorization failed" copy="This authorization request is malformed. Restart it from the application." />;
  }

  const client = await getSdkClientByClientId(params.clientId);
  if (!client) {
    return <ErrorCard title="Authorization failed" copy="Unknown application. Check the client_id your integration was given." />;
  }

  try {
    assertAuthorizeRequest({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      state: params.state,
      registeredUris: client.redirectUris,
      env: process.env.NODE_ENV === "production" ? "production" : "development",
    });
  } catch {
    return <ErrorCard title="Authorization failed" copy="This authorization request is invalid. Restart it from the application." />;
  }

  const session = await auth();
  const walletPublicKey =
    session?.user && typeof session.user === "object" && !session.user.businessId
      ? (session.user.walletPublicKey as string | undefined)
      : undefined;

  if (typeof walletPublicKey !== "string" || walletPublicKey.length === 0) {
    return (
      <ErrorCard
        title="Sign in required"
        copy="Sign in with a student Google account to continue. Business accounts cannot authorize student-status sharing."
      />
    );
  }

  // Bounced back from the authorize POST when no active credential exists
  // (see route.ts): surfaced here, in our own UI, never to the app.
  const bounceError = typeof query.error === "string" ? query.error : Array.isArray(query.error) ? query.error[0] : null;
  if (bounceError === "verification_required") {
    return <VerificationRequiredCard mode={params.mode} />;
  }

  // Authoritative validity gate, same source as the public verify endpoint.
  // Anything but a currently-valid credential stops here, in our own UI.
  let gate: "proceed" | "verification_required" = "verification_required";
  try {
    const user = await findSdkUserByWallet(walletPublicKey);
    gate =
      user && (await hasValidCredential(walletPublicKey as Address))
        ? resolveCredentialGate({ hasValidCredential: true })
        : "verification_required";
  } catch {
    return (
      <ErrorCard
        title="Status check unavailable"
        copy="Credential status could not be read right now. Wait a moment and try again."
      />
    );
  }

  if (gate !== "proceed") {
    return <VerificationRequiredCard mode={params.mode} />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-lg rounded-3xl bg-black p-10 sm:p-12" style={{ color: CREAM }}>
        <p className="mb-6 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
          {client.name} · StudentProof
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Share your student status?</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7" style={{ color: `${CREAM}85` }}>
          <strong className="text-zinc-200">{client.name}</strong> is asking for one fact only: whether
          you currently hold an active StudentProof credential. No email address, wallet address,
          ID details, or proofs leave StudentProof.
        </p>
        <div className="mx-auto mt-8 max-w-xs">
          <ConsentForm
            clientId={params.clientId}
            redirectUri={params.redirectUri}
            state={params.state}
            mode={params.mode}
            codeChallenge={params.codeChallenge}
          />
        </div>
      </div>
    </main>
  );
}
