import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { TopAccessNav } from "@/components/nav-bar/nav-bar";
import BusinessLoginButton from "@/app/api/auth/BusinessLoginButton";
import ApiKeyReveal from "./ApiKeyReveal";

const CREAM = "#E1E0CC";
const BG = "#050608";

const CURL_EXAMPLE = `curl "https://studentproof.app/api/verify?wallet=0xYourStudentWalletAddress" \\
  -H "x-api-key: sp_live_your_api_key"`;

const FETCH_EXAMPLE = `const res = await fetch(
  "https://studentproof.app/api/verify?wallet=0xYourStudentWalletAddress",
  { headers: { "x-api-key": "sp_live_your_api_key" } }
);
const { valid } = await res.json();

if (valid) {
  // wallet holds an active, non-expired StudentProof credential
}`;

const CodeBlock = ({ children }: { children: string }) => (
  <pre
    className="overflow-x-auto rounded-xl p-4 text-sm leading-6"
    style={{ background: "#09090B", border: `1px solid ${CREAM}15`, color: CREAM }}
  >
    <code>{children}</code>
  </pre>
);

export default async function SDKPage() {
  const session = await auth();
  const businessId = session?.user?.businessId;
  const freshApiKey = session?.user?.businessApiKeyOnce;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <TopAccessNav currentPath="/sdk" />
      <div className="relative h-[86vh] w-full max-w-[92rem] overflow-hidden rounded-3xl bg-black">
        <div className="relative flex h-full" style={{ background: BG, color: CREAM }}>
          <aside
            className="sticky top-0 flex h-full w-64 shrink-0 flex-col overflow-y-auto px-8 py-10"
            style={{ borderRight: `1px solid ${CREAM}12` }}
          >
            <Link href="/" className="mb-12 inline-block group">
              <Image
                src="/StudentProof.svg"
                alt="StudentProof"
                width={311}
                height={65}
                priority
                className="h-auto w-40 transition-opacity group-hover:opacity-70"
              />
            </Link>
            <p className="mb-6 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
              SDK
            </p>
            <nav className="space-y-1 text-sm" style={{ color: `${CREAM}55` }}>
              <p className="rounded-lg px-3 py-2.5" style={{ background: `${CREAM}10`, color: CREAM }}>
                Verify a credential
              </p>
            </nav>
            <div className="mt-auto pt-10 text-xs" style={{ color: `${CREAM}30` }}>
              StudentProof © 2025
            </div>
          </aside>

          <section className="mx-auto flex max-w-4xl flex-1 overflow-y-auto px-12 py-14">
            <div className="w-full space-y-6">
              <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
                <p className="mb-6 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
                  SDK
                </p>
                <h1
                  className="mb-6 text-[clamp(2.2rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em]"
                  style={{ color: CREAM }}
                >
                  Verify a student, no install required
                </h1>
                <p className="text-base leading-8" style={{ color: `${CREAM}85` }}>
                  There is no client library to install yet — v1 of the StudentProof SDK is a single
                  HTTP endpoint, gated by an API key. Any backend, frontend, or script can call it
                  directly to check whether a wallet holds an active, non-expired StudentProof credential.
                </p>
              </div>

              {/* Get API Access */}
              <div className="rounded-2xl p-10 text-center" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
                {freshApiKey ? (
                  <>
                    <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
                      You&apos;re in — Free Beta access is active
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: `${CREAM}85` }}>
                      Here is your API key. We&apos;ve also emailed it, but this is the only time it will
                      be shown in full — we only store a hash of it, not the key itself. Free Beta means
                      this is free for now, while we&apos;re in beta — not a permanent promise.
                    </p>
                    <div className="mx-auto mt-6 max-w-md">
                      <ApiKeyReveal apiKey={freshApiKey} />
                    </div>
                  </>
                ) : businessId ? (
                  <>
                    <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
                      Free Beta access is active
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: `${CREAM}85` }}>
                      You already have an API key from when you first signed up — check your inbox for the
                      email we sent. For security we only ever store a hash of it, so we can&apos;t show it
                      again here.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold" style={{ color: CREAM }}>
                      Get API Access (Free Beta)
                    </h2>
                    <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: `${CREAM}85` }}>
                      Sign in with Google to get an API key instantly — no approval, and free while
                      we&apos;re in beta.
                    </p>
                    <div className="mx-auto mt-6 max-w-xs">
                      <BusinessLoginButton />
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
                <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
                  Endpoint
                </h2>
                <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>
                  <code style={{ color: CREAM }}>GET /api/verify?wallet=0x...</code> — read-only, requires
                  your API key as the <code style={{ color: CREAM }}>x-api-key</code> header. CORS is open,
                  so it can be called directly from a browser as well as a server. It calls{" "}
                  <code style={{ color: CREAM }}>hasValidCredential()</code> directly on StudentProof&apos;s
                  deployed smart contract on Avalanche (Fuji testnet) and returns the live result — nothing
                  is cached, and no student data is ever returned, only a boolean.
                </p>
                <CodeBlock>{CURL_EXAMPLE}</CodeBlock>
              </div>

              <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
                <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
                  Response
                </h2>
                <p className="mb-4 text-sm" style={{ color: `${CREAM}85` }}>
                  A JSON object with a single field:
                </p>
                <CodeBlock>{`{ "valid": true }`}</CodeBlock>
                <p className="mt-4 text-sm" style={{ color: `${CREAM}85` }}>
                  <code style={{ color: CREAM }}>valid</code> is <code style={{ color: CREAM }}>true</code>{" "}
                  only if the wallet holds at least one credential that is neither expired nor revoked. A
                  missing or invalid <code style={{ color: CREAM }}>x-api-key</code> returns{" "}
                  <code style={{ color: CREAM }}>401</code>; a missing or malformed{" "}
                  <code style={{ color: CREAM }}>wallet</code> parameter returns{" "}
                  <code style={{ color: CREAM }}>400</code> — both with an{" "}
                  <code style={{ color: CREAM }}>error</code> field instead of <code style={{ color: CREAM }}>valid</code>.
                </p>
              </div>

              <div className="rounded-2xl p-10" style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}>
                <h2 className="mb-3 text-lg font-semibold" style={{ color: CREAM }}>
                  From a browser or server (fetch)
                </h2>
                <CodeBlock>{FETCH_EXAMPLE}</CodeBlock>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
