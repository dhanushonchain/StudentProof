import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Self-serve developer key management. Authenticated by the caller's own
// business session (google-business sign-in) — never by an API key, so these
// endpoints cannot be used to bootstrap access. Student sessions (no
// businessId) are rejected: students own no API keys.
async function requireBusinessId(): Promise<string | null> {
  const session = await auth();
  const businessId = session?.user?.businessId;
  return typeof businessId === "string" && businessId.length > 0 ? businessId : null;
}

// Lists the caller's keys (active and revoked) plus business-level usage
// statistics. No hashes or secrets are ever returned.
export async function GET() {
  const businessId = await requireBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Not signed in as a developer account." }, { status: 401 });
  }
  const { listBusinessApiKeys, getBusinessUsageStats } = await import("@/lib/developer-keys");
  const [keys, usage] = await Promise.all([listBusinessApiKeys(businessId), getBusinessUsageStats(businessId)]);
  return NextResponse.json({ keys, usage }, { headers: { "Cache-Control": "no-store" } });
}

// Creates a new key. The raw secret is returned EXACTLY ONCE in this
// response — the dashboard must show it immediately and never fetch it again.
export async function POST(req: NextRequest) {
  const businessId = await requireBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Not signed in as a developer account." }, { status: 401 });
  }
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const label =
    body && typeof body === "object" && "label" in body
      ? (body as { label?: unknown }).label ?? "Default"
      : "Default";
  const { createBusinessApiKey } = await import("@/lib/developer-keys");
  try {
    const { key, secret } = await createBusinessApiKey(businessId, label);
    return NextResponse.json(
      { key, secret, warning: "Copy this secret now — it will never be shown again." },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create API key." },
      { status: 400 }
    );
  }
}
