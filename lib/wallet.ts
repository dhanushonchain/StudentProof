import crypto from "crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

// Derive a deterministic EVM (secp256k1) private key from a user's Google sub and server secret.
// This implements a social-login wallet pattern similar to Web3Auth, where the user's
// wallet is derived from their identity provider (Google) plus a server-side secret.
// This means:
// - Same user always gets the same wallet if they log in again
// - Private key is never stored—derived fresh each time from the same inputs
// - If server secret is compromised, wallets are compromised (but no private keys are in storage)
export function deriveAccount(googleSub: string) {
  const walletSecret = process.env.AVALANCHE_WALLET_SECRET;
  if (!walletSecret) {
    throw new Error("AVALANCHE_WALLET_SECRET environment variable is not set");
  }

  // Combine Google sub with server secret and hash to create a seed.
  // SHA256 output is 32 bytes, exactly what's needed for a secp256k1 private key.
  const combined = `${googleSub}:${walletSecret}`;
  const seed = crypto.createHash("sha256").update(combined).digest();
  const privateKey = `0x${seed.toString("hex")}` as Hex;

  return { account: privateKeyToAccount(privateKey), privateKey };
}
