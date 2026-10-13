import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// PATCH /api/developer/oauth-clients/[clientId]
// Updates allowed callback URLs or website URL for an application owned by the caller.
export async function PATCH(
  req: NextRequest,
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

  let body: Record<string, unknown>;
  try {
    const json = await req.json();
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    body = json as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { parseAndValidateCallbackUrls, validateWebsiteUrl } = await import("@/lib/sdk-client-policy");
  const env = process.env.NODE_ENV === "production" ? "production" : "development";

  let redirectUris: string[] | undefined;
  let websiteUrl: string | undefined;

  try {
    if ("redirectUris" in body) {
      redirectUris = parseAndValidateCallbackUrls(body.redirectUris, env);
    }
    if ("websiteUrl" in body && body.websiteUrl !== undefined) {
      websiteUrl = validateWebsiteUrl(body.websiteUrl, env);
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation error." },
      { status: 400 }
    );
  }

  if (redirectUris === undefined && websiteUrl === undefined) {
    return NextResponse.json({ error: "No fields to update provided." }, { status: 400 });
  }

  const { updateSdkClientRedirectUris } = await import("@/lib/sdk-store");
  try {
    const updated = await updateSdkClientRedirectUris({
      businessId,
      id: clientId,
      redirectUris,
      websiteUrl,
    });

    if (!updated) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json({ client: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update application." },
      { status: 400 }
    );
  }
}
