import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Server-only auth instance with wallet callbacks
// This is NOT imported by middleware, only by server components and API routes
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile && profile.sub) {
        const googleSub = profile.sub;

        // account is only present on a fresh sign-in, so this timestamp stays fixed
        // for the lifetime of the session instead of drifting on every token refresh
        token.loginAt = new Date().toISOString();

        // If walletPublicKey is not in the token, this is the first login (or wallet was never created)
        let walletFunded = false;
        if (!token.walletPublicKey) {
          // Lazy-import server-only wallet handler
          const { createWalletForNewUser } = await import("@/lib/auth-wallet");
          const { publicKey, funded } = await createWalletForNewUser(googleSub);
          console.log("[Wallet] Created wallet for user", googleSub, "public key:", publicKey);
          token.walletPublicKey = publicKey;
          token.googleSub = googleSub;
          walletFunded = funded;
        } else {
          console.log("[Wallet] Wallet already exists for user, public key:", token.walletPublicKey);
        }

        // Lazy-import server-only DB handler — same Edge-safety reasoning as the wallet import above
        const { logSignIn } = await import("@/lib/activity-db");
        await logSignIn({
          googleSub,
          email: profile.email ?? "",
          walletAddress: token.walletPublicKey as string,
          walletFunded,
        });
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.walletPublicKey = token.walletPublicKey as string;
        session.user.loginAt = token.loginAt as string;
      }
      return session;
    },
  },
});