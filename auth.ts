import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile && profile.sub) {
        const googleSub = profile.sub;

        // If walletPublicKey is not in the token, this is the first login (or wallet was never created)
        if (!token.walletPublicKey) {
          // Lazy-import server-only wallet handler to keep Node.js crypto out of edge bundle analysis
          const { createWalletForNewUser } = await import("@/lib/auth-wallet");
          const publicKey = await createWalletForNewUser(googleSub);
          console.log("[Wallet] Created wallet for user", googleSub, "public key:", publicKey);
          token.walletPublicKey = publicKey;
          token.googleSub = googleSub;
        } else {
          console.log("[Wallet] Wallet already exists for user, public key:", token.walletPublicKey);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.walletPublicKey = token.walletPublicKey as string;
      }
      return session;
    },
  },
});