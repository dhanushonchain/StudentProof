// Wallet operations for NextAuth sign-in flow. Only called server-to-server
// from auth.ts's jwt callback via lazy dynamic import, never from client.
//
// The dynamic import below is load-bearing: lib/wallet.ts pulls in Node's `crypto`
// module and viem's Node-targeted account/transport code, neither of which is
// Edge-Runtime-safe. Keeping the import inside this function (rather than a static
// top-level import) keeps that dependency graph out of anything that gets bundled
// for the Edge Runtime, e.g. middleware.ts via auth.config.ts.

export async function createWalletForNewUser(googleSub: string): Promise<string> {
  // Lazy-import wallet module to keep it out of edge bundle analysis
  const { getOrCreateWallet } = await import("./wallet");
  const { publicKey } = await getOrCreateWallet(googleSub, true);
  return publicKey;
}
