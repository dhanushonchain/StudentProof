import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe auth configuration - contains only providers and basic config
// This is imported by middleware and must not include any Node.js-only code
export const authConfig = {
  providers: [
    // Student sign-in — default provider id "google", unchanged. Creates a
    // wallet + User row (see auth.ts's jwt callback).
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    // Business sign-in for the /sdk "Get API Access" button — same real
    // Google OAuth client, but a distinct provider id so auth.ts's jwt
    // callback can tell the two flows apart via account.provider and route
    // to the Business table instead of User. Never creates a wallet, never
    // touches the User table.
    Google({
      id: "google-business",
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
} satisfies NextAuthConfig;
