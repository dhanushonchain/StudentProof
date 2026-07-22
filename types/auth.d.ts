import NextAuth from "next-auth";

declare module "next-auth" {
  interface User {
    walletPublicKey?: string;
    loginAt?: string;
  }

  interface Session {
    user: User & {
      walletPublicKey?: string;
      loginAt?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    walletPublicKey?: string;
    googleSub?: string;
    loginAt?: string;
  }
}
