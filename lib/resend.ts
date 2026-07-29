import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  throw new Error("RESEND_API_KEY environment variable is not set");
}

export const resend = new Resend(apiKey);

// Transactional mail (this address) is kept visually distinct from marketing
// announcements, which send from team@update.studentproof.app instead.
export const WELCOME_FROM_ADDRESS = "StudentProof <team@update.studentproof.app>";
