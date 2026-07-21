import { Keypair } from "@stellar/stellar-sdk";
import crypto from "crypto";

// Stellar testnet Friendbot URL for funding new accounts
const FRIENDBOT_URL = "https://friendbot.stellar.org";
const STELLAR_TESTNET_HORIZON_URL = "https://horizon-testnet.stellar.org";

// Derive a deterministic Stellar keypair from a user's Google sub and server secret.
// This implements a social-login wallet pattern similar to Web3Auth, where the user's
// wallet is derived from their identity provider (Google) plus a server-side secret.
// This means:
// - Same user always gets the same wallet if they log in again
// - Private key is never stored—derived fresh each time from the same inputs
// - If server secret is compromised, wallets are compromised (but no private keys are in storage)
export function deriveKeypair(googleSub: string): Keypair {
  const walletSecret = process.env.STELLAR_WALLET_SECRET;
  if (!walletSecret) {
    throw new Error("STELLAR_WALLET_SECRET environment variable is not set");
  }

  // Combine Google sub with server secret and hash to create a seed
  const combined = `${googleSub}:${walletSecret}`;
  const seed = crypto
    .createHash("sha256")
    .update(combined)
    .digest();

  // Create Stellar keypair from the 32-byte seed
  // Stellar keypairs are Ed25519, and Keypair.fromRawEd25519Seed expects a 32-byte seed
  const keypair = Keypair.fromRawEd25519Seed(seed);

  return keypair;
}

// Check if a Stellar account already exists on the testnet via Horizon API.
// Returns true if the account is already on-chain, false if it doesn't exist.
async function accountExists(publicKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${STELLAR_TESTNET_HORIZON_URL}/accounts/${publicKey}`
    );
    if (response.status === 404) {
      return false; // Account doesn't exist
    }
    if (response.ok) {
      return true; // Account exists
    }
    // Other status codes: log but assume account might exist to be safe
    console.warn(
      `Unexpected Horizon response checking account ${publicKey}: ${response.status}`
    );
    return true;
  } catch (error) {
    console.error("Error checking if account exists on Stellar:", error);
    // On network error, assume account might exist to avoid duplicate funding attempts
    return true;
  }
}

// Fund a new Stellar account using Friendbot (testnet only).
// Skips funding if the account already exists on-chain.
// Non-fatal if account is already funded; this allows repeat sign-ins to work correctly.
export async function fundWalletWithFriendbot(publicKey: string): Promise<void> {
  try {
    // Check if account already exists on Stellar testnet
    const exists = await accountExists(publicKey);
    if (exists) {
      // Account already funded, nothing to do
      return;
    }

    // Account doesn't exist, fund it via Friendbot
    const response = await fetch(`${FRIENDBOT_URL}?addr=${publicKey}`);
    if (!response.ok) {
      const text = await response.text();
      // If Friendbot says account is already funded, that's fine—treat as non-fatal success
      // (can happen in race conditions or if the account was funded externally)
      if (response.status === 400 && text.includes("already funded")) {
        console.warn(
          `Account ${publicKey} was already funded (race condition), continuing`
        );
        return;
      }
      throw new Error(`Friendbot funding failed: ${response.status} ${text}`);
    }
  } catch (error) {
    console.error("Failed to fund wallet with Friendbot:", error);
    throw error;
  }
}

// Get or create a wallet for a user.
// On first login, this derives the keypair and funds it.
// On subsequent logins, it just derives the same keypair (deterministic).
export async function getOrCreateWallet(
  googleSub: string,
  isFirstLogin: boolean
): Promise<{ publicKey: string; privateKey: string }> {
  const keypair = deriveKeypair(googleSub);
  const publicKey = keypair.publicKey();

  if (isFirstLogin) {
    // Fund the account on first login so it's immediately usable
    await fundWalletWithFriendbot(publicKey);
  }

  return {
    publicKey,
    privateKey: keypair.secret(), // Only exposed internally; never sent to client
  };
}
