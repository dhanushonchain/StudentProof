// Fire-and-forget welcome email for genuinely new accounts. Only called from
// auth.ts's jwt callback via lazy dynamic import — same Edge-safety reasoning
// as lib/wallet.ts and lib/activity-db.ts (this pulls in the Resend SDK,
// which has no business being in anything reachable from the Edge Runtime).
//
// Never throws: a failed send should never fail sign-in. Errors are logged
// and swallowed here so the caller can fire this without awaiting it.

const WELCOME_SUBJECT = "Welcome to StudentProof";

const WELCOME_TEXT = `Welcome to StudentProof!

Your account and wallet are ready to go.

Next step: verify your student status to get your reusable credential.

— The StudentProof Team`;

export async function sendWelcomeEmail(email: string): Promise<void> {
  try {
    const { resend, WELCOME_FROM_ADDRESS } = await import("./resend");
    const { error } = await resend.emails.send({
      from: WELCOME_FROM_ADDRESS,
      to: [email],
      subject: WELCOME_SUBJECT,
      text: WELCOME_TEXT,
    });

    if (error) {
      console.error("[Welcome email] Resend returned an error:", error);
    }
  } catch (error) {
    console.error("[Welcome email] Failed to send:", error);
  }
}
