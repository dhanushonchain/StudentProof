import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Middleware uses a separate, edge-safe auth instance with only providers
// This never imports Node.js-only modules like wallet.ts or crypto
const { auth } = NextAuth(authConfig);
export const middleware = auth;

export const config = {
  matcher: ["/dashboard/:path*"],
};