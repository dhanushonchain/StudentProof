import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/developer/oauth-clients/[clientId]/revoke
// Revokes an application owned by the caller. Idempotent.
// Revoked applications immediately fail authorize and token endpoints.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const session = await auth();
  const businessId = session?.user?.businessId;
  if (typeof businessId !== "string" || businessId.length === 0) {
    return NextResponse.json({ error: "Not signed in as a developer account." }, { status: 401 });
  }

  const { clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ error: "Client ID is required." }, { status: 400 });
  }

  const { revokeSdkClient } = await import("@/lib/sdk-store");
  try {
    const client = await revokeSdkClient({ businessId, id: clientId });
    if (!client) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json({ client }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not revoke application." },
      { status: 400 }
    );
  }
}
