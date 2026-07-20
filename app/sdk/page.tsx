import Image from "next/image";
import Link from "next/link";
import { TopAccessNav } from "@/components/nav-bar/nav-bar";

const CREAM = "#E1E0CC";
const BG = "#050608";
const sdkContent = {
  label: "SDK",
  heading: "SDK documentation placeholder",
  body: "Full SDK guides, installation, and examples will be added here.",
  sidebarItem: "SDK Placeholder",
} as const;

export default function SDKPage() {
  const content = sdkContent;

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
              {content.label}
            </p>
            <nav className="space-y-1 text-sm" style={{ color: `${CREAM}55` }}>
              <p className="rounded-lg px-3 py-2.5" style={{ background: `${CREAM}10`, color: CREAM }}>
                {content.sidebarItem}
              </p>
            </nav>
            <div className="mt-auto pt-10 text-xs" style={{ color: `${CREAM}30` }}>
              StudentProof © 2025
            </div>
          </aside>

          <section className="mx-auto flex max-w-4xl flex-1 items-center px-12 py-14">
            <div
              className="w-full rounded-2xl p-10"
              style={{ border: `1px solid ${CREAM}15`, background: `${CREAM}05` }}
            >
              <p className="mb-6 text-[0.7rem] uppercase tracking-[0.25em]" style={{ color: `${CREAM}60` }}>
                {content.label}
              </p>
              <h1
                className="mb-6 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.9] tracking-[-0.05em]"
                style={{ color: CREAM }}
              >
                {content.heading}
              </h1>
              <p className="text-base leading-8" style={{ color: `${CREAM}85` }}>
                {content.body}
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}