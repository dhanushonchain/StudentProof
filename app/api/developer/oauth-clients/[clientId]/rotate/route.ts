import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// POST /api/developer/oauth-clients/[clientId]/rotate
// Rotates the client secret of an application owned by the caller.
// The new secret is returned EXACTLY ONCE. The previous secret is immediately invalidated.
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

  const { rotateSdkClientSecret } = await import("@/lib/sdk-store");
  try {
    const result = await rotateSdkClientSecret({ businessId, id: clientId });
    if (!result) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    const email = session?.user?.email;
    if (email) {
      const { sendClientSecretEmail } = await import("@/lib/business-email");
      await sendClientSecretEmail(email, {
        appName: result.client.name,
        clientId: result.client.clientId,
        clientSecret: result.secret,
        rotated: true,
      });
    }

    return NextResponse.json(
      {
        client: result.client,
        clientSecret: result.secret,
        warning: "Copy this client secret now. It will never be displayed again. The previous secret is now invalid.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not rotate secret." },
      { status: 400 }
    );
  }
}
