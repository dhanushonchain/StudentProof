// Wallet operations for NextAuth sign-in flow. Only called server-to-server
// from auth.ts's jwt callback via lazy dynamic import, never from client.

export async function createWalletForNewUser(googleSub: string): Promise<string> {
  // Lazy-import wallet module to keep it out of edge bundle analysis
  const { getOrCreateWallet } = await import("./wallet");
  const { publicKey } = await getOrCreateWallet(googleSub, true);
  return publicKey;
}
