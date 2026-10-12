import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Revokes one of the caller's own keys. Idempotent and scoped: a key owned
// by another business behaves exactly like a nonexistent key (404), so key
// ids cannot be probed across tenants. Revoked keys stop authenticating
// immediately; their rows and usage history are kept for audit.
export async function POST(_req: Request, { params }: { params: Promise<{ keyId: string }> }) {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (typeof businessId !== "string" || businessId.length === 0) {
    return NextResponse.json({ error: "Not signed in as a developer account." }, { status: 401 });
  }
  const { keyId } = await params;
  const { revokeBusinessApiKey } = await import("@/lib/developer-keys");
  const key = await revokeBusinessApiKey(businessId, keyId);
  if (!key) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }
  return NextResponse.json({ key }, { headers: { "Cache-Control": "no-store" } });
}
