import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { TopAccessNav } from "@/components/nav-bar/nav-bar";
import { SdkAccessPanel, SdkEndpointDocs } from "./sdk-content";

const CREAM = "#E1E0CC";
const BG = "#050608";

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
              <SdkAccessPanel businessId={businessId} freshApiKey={freshApiKey} />

              <SdkEndpointDocs />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
