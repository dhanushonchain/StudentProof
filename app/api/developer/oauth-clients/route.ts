import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

async function requireBusinessId(): Promise<string | null> {
  const session = await auth();
  const businessId = session?.user?.businessId;
  return typeof businessId === "string" && businessId.length > 0 ? businessId : null;
}

// GET /api/developer/oauth-clients
// Lists all OAuth applications registered by the authenticated developer account.
// Plaintext secrets and secret hashes are NEVER returned.
export async function GET() {
  const businessId = await requireBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Not signed in as a developer account." }, { status: 401 });
  }

  const { listSdkClientsForBusiness } = await import("@/lib/sdk-store");
  const clients = await listSdkClientsForBusiness(businessId);
  return NextResponse.json({ clients }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/developer/oauth-clients
// Registers a new OAuth application for "Sign in with StudentProof".
// Generates a cryptographically random client ID (sp_client_...) and client secret (sp_sk_...).
// The raw client secret is returned EXACTLY ONCE here and must be stored securely by the developer.
export async function POST(req: NextRequest) {
  const businessId = await requireBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Not signed in as a developer account." }, { status: 401 });
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

  const { validateApplicationName, validateWebsiteUrl, parseAndValidateCallbackUrls } = await import(
    "@/lib/sdk-client-policy"
  );

  const env = process.env.NODE_ENV === "production" ? "production" : "development";

  let name: string;
  let websiteUrl: string;
  let redirectUris: string[];

  try {
    name = validateApplicationName(body.name);
    websiteUrl = validateWebsiteUrl(body.websiteUrl, env);
    redirectUris = parseAndValidateCallbackUrls(body.redirectUris, env);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation error." },
      { status: 400 }
    );
  }

  const { createSdkClientForBusiness } = await import("@/lib/sdk-store");
  try {
    const { client, secret } = await createSdkClientForBusiness({
      businessId,
      name,
      websiteUrl,
      redirectUris,
    });

    return NextResponse.json(
      {
        client,
        clientSecret: secret,
        warning: "Copy this client secret now. It will never be displayed again.",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create application." },
      { status: 500 }
    );
  }
}
