import NextAuth from "next-auth";

declare module "next-auth" {
  interface User {
    walletPublicKey?: string;
    loginAt?: string;
    googleEmailVerified?: boolean;
    businessId?: string;
    businessName?: string;
    businessApiKeyOnce?: string;
  }

  interface Session {
    user: User & {
      walletPublicKey?: string;
      loginAt?: string;
      googleEmailVerified?: boolean;
      businessId?: string;
      businessName?: string;
      businessApiKeyOnce?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    walletPublicKey?: string;
    googleSub?: string;
    loginAt?: string;
    googleEmailVerified?: boolean;
    businessId?: string;
    businessName?: string;
    businessApiKeyOnce?: string;
  }
}
