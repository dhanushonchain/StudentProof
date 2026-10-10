// Sends a business's API key by email right after signup, reusing the same
// Resend setup as lib/welcome-email.ts. Never throws — the key is already
// shown on-screen at signup, so a failed send here degrades gracefully
// rather than blocking or failing the signup itself.

const SUBJECT = "Your StudentProof API key (Free Beta)";

function buildText(apiKey: string): string {
  return `Welcome to StudentProof for Business — you're on the Free Beta.

Your API key:

${apiKey}

Free Beta means this access is free for now while we're in beta — it isn't
a permanent promise, and pricing will be introduced later.

Keep this key secret — anyone with it can call the verification API on your
behalf. We only ever store a hash of it, so this is the only place you'll
see it in full. Signing in again with the same Google account won't issue a
new one — save this now.

Use it by sending it as the "x-api-key" header on requests to:
GET https://studentproof.app/api/verify?wallet=0x...

— The StudentProof Team`;
}

export async function sendApiKeyEmail(email: string, apiKey: string): Promise<void> {
  try {
    const { resend, WELCOME_FROM_ADDRESS } = await import("./resend");
    const { error } = await resend.emails.send({
      from: WELCOME_FROM_ADDRESS,
      to: [email],
      subject: SUBJECT,
      text: buildText(apiKey),
    });

    if (error) {
      console.error("[API key email] Resend returned an error:", error);
    }
  } catch (error) {
    console.error("[API key email] Failed to send:", error);
  }
}
