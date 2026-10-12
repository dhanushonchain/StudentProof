import NextAuth from "next-auth";
import { after } from "next/server";
import { authConfig } from "./auth.config";

// Server-only auth instance with wallet callbacks
// This is NOT imported by middleware, only by server components and API routes
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (!account || !profile || !profile.sub) {
        return token;
      }
      const googleSub = profile.sub;

      // account.provider distinguishes the two Google provider configs in
      // auth.config.ts — "google-business" (the /sdk "Get API Access"
      // button) is a completely separate branch from the student flow
      // below, and the two must never cross: this branch never imports or
      // calls anything that touches the User table, and the student branch
      // never touches Business.
      if (account.provider === "google-business") {
        const { findOrCreateBusinessForGoogleSignIn } = await import("@/lib/business-db");
        const { business, apiKey, isNew } = await findOrCreateBusinessForGoogleSignIn({
          googleSub,
          name: profile.name ?? profile.email ?? "Business",
          email: profile.email ?? "",
        });

        token.businessId = business.id;
        token.businessName = business.name;
        // Only present on the exact sign-in that created the row — a raw
        // API key is shown/emailed exactly once and never again, so this
        // must NOT get re-set on a returning business's later sign-ins.
        if (isNew) {
          token.businessApiKeyOnce = apiKey;
        }

        if (isNew && profile.email) {
          const email = profile.email;
          const rawApiKey = apiKey;
          after(async () => {
            if (!rawApiKey) return;
            const { sendApiKeyEmail } = await import("@/lib/business-email");
            await sendApiKeyEmail(email, rawApiKey);
          });
        }

        return token;
      }

      // --- Student flow (unchanged) ---

      // account is only present on a fresh sign-in, so this timestamp stays fixed
      // for the lifetime of the session instead of drifting on every token refresh
      token.loginAt = new Date().toISOString();

      // Whether Google itself reports the account email as verified. This is
      // display-only metadata (used to label the "verified email" card
      // truthfully): identity is ALWAYS anchored on googleSub, never on the
      // email string, so duplicate or unverified emails across Google accounts
      // can never collide or impersonate. Absent/unknown counts as false.
      token.googleEmailVerified = profile.email_verified === true;

      // If walletPublicKey is not in the token, this is the first login (or wallet was never created)
      if (!token.walletPublicKey) {
        // Lazy-import server-only wallet handler
        const { createWalletForNewUser } = await import("@/lib/auth-wallet");
        const { publicKey } = await createWalletForNewUser(googleSub);
        console.log("[Wallet] Created wallet for user", googleSub, "public key:", publicKey);
        token.walletPublicKey = publicKey;
        token.googleSub = googleSub;
      } else {
        console.log("[Wallet] Wallet already exists for user, public key:", token.walletPublicKey);
      }

      // Lazy-import server-only DB handler — same Edge-safety reasoning as the wallet import above
      const { logSignIn } = await import("@/lib/activity-db");
      const { isNewUser } = await logSignIn({
        googleSub,
        email: profile.email ?? "",
        walletAddress: token.walletPublicKey as string,
      });

      // Genuinely new account (not a repeat sign-in) — send the welcome email.
      // Scheduled via after() so it can't slow down or fail sign-in: it runs
      // once the response is on its way out, and errors are caught inside
      // the function itself, never propagating back here.
      if (isNewUser && profile.email) {
        const email = profile.email;
        after(async () => {
          const { sendWelcomeEmail } = await import("@/lib/welcome-email");
          await sendWelcomeEmail(email);
        });
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.walletPublicKey = token.walletPublicKey as string;
        session.user.loginAt = token.loginAt as string;
        session.user.googleEmailVerified = token.googleEmailVerified === true;
        session.user.businessId = token.businessId as string | undefined;
        session.user.businessName = token.businessName as string | undefined;
        session.user.businessApiKeyOnce = token.businessApiKeyOnce as string | undefined;
      }
      return session;
    },
  },
});
