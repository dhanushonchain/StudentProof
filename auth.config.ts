import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe auth configuration - contains only providers and basic config
// This is imported by middleware and must not include any Node.js-only code
export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
} satisfies NextAuthConfig;
