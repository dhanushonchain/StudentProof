import crypto from "crypto";
import { createPublicClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

const FUJI_RPC_URL = process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

// Amount of testnet AVAX sent from the distributor wallet to a freshly created user wallet.
const FUNDING_AMOUNT_AVAX = process.env.AVALANCHE_FUNDING_AMOUNT || "0.05";

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(FUJI_RPC_URL),
});

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

// Check whether a wallet already holds testnet AVAX, so repeat sign-ins (or accounts
// funded by some other means) don't get funded again.
async function isWalletFunded(address: Address): Promise<boolean> {
  try {
    const balance = await publicClient.getBalance({ address });
    return balance > BigInt(0);
  } catch (error) {
    console.error("Error checking Fuji balance:", error);
    // On network error, assume the wallet might already be funded to avoid duplicate funding attempts
    return true;
  }
}

// Fund a new wallet with testnet AVAX from a pre-funded distributor wallet.
//
// Avalanche's Fuji faucet (unlike Stellar's Friendbot) is captcha-protected and has no
// public unauthenticated API, so it can't be called server-to-server. Instead, this
// project holds one manually-faucet-funded "distributor" wallet and forwards a small
// amount of testnet AVAX from it to each new user wallet.
//
// Skips funding if the wallet already has a balance. Non-fatal if already funded (mirrors
// Friendbot's "already funded" handling); this allows repeat sign-ins to work correctly.
//
// Returns whether a transaction was actually sent (true) vs. skipped because the wallet
// was already funded (false) — callers use this to distinguish a genuinely new wallet
// from a repeat sign-in.
export async function fundWalletFromDistributor(address: Address): Promise<boolean> {
  const distributorKey = process.env.DISTRIBUTOR_WALLET_PRIVATE_KEY as Hex | undefined;
  if (!distributorKey) {
    throw new Error("DISTRIBUTOR_WALLET_PRIVATE_KEY environment variable is not set");
  }

  try {
    const alreadyFunded = await isWalletFunded(address);
    if (alreadyFunded) {
      // Wallet already funded, nothing to do
      return false;
    }

    const distributorAccount = privateKeyToAccount(distributorKey);
    const walletClient = createWalletClient({
      account: distributorAccount,
      chain: avalancheFuji,
      transport: http(FUJI_RPC_URL),
    });

    const hash = await walletClient.sendTransaction({
      to: address,
      value: parseEther(FUNDING_AMOUNT_AVAX),
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return true;
  } catch (error) {
    console.error("Failed to fund wallet from distributor:", error);
    throw error;
  }
}

// Get or create a wallet for a user.
// On first login, this derives the account and funds it.
// On subsequent logins, it just derives the same account (deterministic).
export async function getOrCreateWallet(
  googleSub: string,
  isFirstLogin: boolean
): Promise<{ publicKey: string; privateKey: string; funded: boolean }> {
  const { account, privateKey } = deriveAccount(googleSub);

  let funded = false;
  if (isFirstLogin) {
    // Fund the wallet on first login so it's immediately usable
    funded = await fundWalletFromDistributor(account.address);
  }

  return {
    publicKey: account.address,
    privateKey, // Only exposed internally; never sent to client
    funded,
  };
}
