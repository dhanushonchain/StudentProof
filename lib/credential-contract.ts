import "server-only";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

const RPC_URL = process.env.AVALANCHE_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

const STUDENT_CREDENTIAL_REGISTRY_ADDRESS = process.env.STUDENT_CREDENTIAL_REGISTRY_ADDRESS as Address | undefined;
const MINTER_PRIVATE_KEY = process.env.MINTER_PRIVATE_KEY as Hex | undefined;

// Minimal hand-written ABI fragment — just what this module calls/decodes.
// Full source is verified on Snowtrace; see contracts/src/StudentCredentialRegistry.sol.
const STUDENT_CREDENTIAL_REGISTRY_ABI = [
  {
    type: "function",
    name: "mintCredential",
    stateMutability: "nonpayable",
    inputs: [
      { name: "student", type: "address" },
      { name: "providerId", type: "string" },
      { name: "expiresAt", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hasValidCredential",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "CredentialMinted",
    inputs: [
      { name: "student", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "providerId", type: "string", indexed: false },
      { name: "issuedAt", type: "uint256", indexed: false },
      { name: "expiresAt", type: "uint256", indexed: false },
    ],
  },
] as const;

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(RPC_URL) });

// ISOLATED-TEST seam for hasValidCredential (mocked chain reads in automated
// tests — ordinary tests must never generate chain traffic).
//
// Activation requires BOTH: STUDENTPROOF_STUB_CREDENTIALS=valid|invalid|error
// AND a non-production runtime (NODE_ENV=production and Vercel
// production/preview both disable it, regardless of the flag). "error" throws
// so callers exercise their fail-closed paths. Every activation logs a loud
// warning so a stub can never silently masquerade as a real chain read.
function stubbedCredentialResult(): boolean | null {
  const mode = process.env.STUDENTPROOF_STUB_CREDENTIALS;
  if (mode !== "valid" && mode !== "invalid" && mode !== "error") return null;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    return null;
  }
  console.warn(`[Credential] STUBBED credential read (${mode}) — isolated testing only, never production.`);
  if (mode === "error") throw new Error("stubbed credential outage (STUDENTPROOF_STUB_CREDENTIALS=error)");
  return mode === "valid";
}

export async function mintStudentCredential({
  studentAddress,
  providerId,
  expiresAt,
}: {
  studentAddress: Address;
  providerId: string;
  expiresAt: Date;
}): Promise<{ contractAddress: Address; tokenId: string; transactionHash: Hex }> {
  if (!STUDENT_CREDENTIAL_REGISTRY_ADDRESS) {
    throw new Error("STUDENT_CREDENTIAL_REGISTRY_ADDRESS environment variable is not set");
  }
  if (!MINTER_PRIVATE_KEY) {
    throw new Error("MINTER_PRIVATE_KEY environment variable is not set");
  }

  // Contract stores expiresAt as a Unix timestamp in seconds, not milliseconds.
  const expiresAtSeconds = BigInt(Math.floor(expiresAt.getTime() / 1000));

  const minterAccount = privateKeyToAccount(MINTER_PRIVATE_KEY);
  const walletClient = createWalletClient({ account: minterAccount, chain: avalancheFuji, transport: http(RPC_URL) });

  // Avalanche's public Fuji RPC (api.avax-test.network) has a gas-estimation
  // bug: eth_estimateGas returns an astronomical, unpayable number whenever
  // EIP-1559 fee fields are included in the same call AND the account param
  // is a full signing account object rather than a plain address. viem adds
  // those fee fields automatically when given a signing account, so estimate
  // gas separately here (address-only account, forced legacy type) to get a
  // sane number, then pass it explicitly into simulateContract so it isn't
  // silently re-estimated (and re-broken) inside writeContract.
  const estimatedGas = await publicClient.estimateContractGas({
    address: STUDENT_CREDENTIAL_REGISTRY_ADDRESS,
    abi: STUDENT_CREDENTIAL_REGISTRY_ABI,
    functionName: "mintCredential",
    args: [studentAddress, providerId, expiresAtSeconds],
    account: minterAccount.address,
    type: "legacy",
  });
  const gas = (estimatedGas * BigInt(120)) / BigInt(100);

  // Simulate first so an obviously-doomed call reverts cheaply here instead
  // of burning gas on a real transaction.
  const { request } = await publicClient.simulateContract({
    address: STUDENT_CREDENTIAL_REGISTRY_ADDRESS,
    abi: STUDENT_CREDENTIAL_REGISTRY_ABI,
    functionName: "mintCredential",
    args: [studentAddress, providerId, expiresAtSeconds],
    account: minterAccount,
    gas,
  });

  const transactionHash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });

  // Decode the real tokenId from the emitted event rather than trusting the
  // simulated return value — the simulation and the mined tx are technically
  // two different calls, so read the outcome of the one that actually landed.
  const [mintedEvent] = parseEventLogs({
    abi: STUDENT_CREDENTIAL_REGISTRY_ABI,
    eventName: "CredentialMinted",
    logs: receipt.logs,
  });

  if (!mintedEvent) {
    throw new Error(`mintCredential transaction ${transactionHash} confirmed but emitted no CredentialMinted event`);
  }

  return {
    contractAddress: STUDENT_CREDENTIAL_REGISTRY_ADDRESS,
    tokenId: mintedEvent.args.tokenId.toString(),
    transactionHash,
  };
}

// Read-only check — no private key needed, just an eth_call. Backs the
// public GET /api/verify endpoint that lets any third party check a
// wallet's credential status without installing anything.
export async function hasValidCredential(walletAddress: Address): Promise<boolean> {
  const stub = stubbedCredentialResult();
  if (stub !== null) return stub;

  if (!STUDENT_CREDENTIAL_REGISTRY_ADDRESS) {
    throw new Error("STUDENT_CREDENTIAL_REGISTRY_ADDRESS environment variable is not set");
  }

  return publicClient.readContract({
    address: STUDENT_CREDENTIAL_REGISTRY_ADDRESS,
    abi: STUDENT_CREDENTIAL_REGISTRY_ABI,
    functionName: "hasValidCredential",
    args: [walletAddress],
  });
}

export type MintReceiptCheck = { found: false } | { found: true; succeeded: boolean; tokenId: string | null };

// Receipt lookup for a previously broadcast mint hash — the reconciliation
// primitive for ambiguous attempts (timeout before hash receipt, crash
// between broadcast and DB write). `found: false` covers BOTH "unknown
// hash" and "still pending" (viem cannot distinguish them): callers must
// treat it as ambiguous and re-check later, never as failure.
export async function getMintReceipt(txHash: Hex): Promise<MintReceiptCheck> {
  if (!STUDENT_CREDENTIAL_REGISTRY_ADDRESS) {
    throw new Error("STUDENT_CREDENTIAL_REGISTRY_ADDRESS environment variable is not set");
  }

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  } catch {
    return { found: false };
  }
  if (!receipt || receipt.status !== "success") {
    return { found: true, succeeded: false, tokenId: null };
  }

  const [mintedEvent] = parseEventLogs({
    abi: STUDENT_CREDENTIAL_REGISTRY_ABI,
    eventName: "CredentialMinted",
    logs: receipt.logs,
  });
  return { found: true, succeeded: true, tokenId: mintedEvent?.args.tokenId.toString() ?? null };
}

// All tokenIds ever minted to a wallet per CredentialMinted logs (student
// is an indexed event param, so the node filters server-side). Used to
// adopt an on-chain credential that never got a database row, instead of
// blindly rebroadcasting. Malformed input yields [] rather than throwing.
export async function findMintedTokenIds(walletAddress: string): Promise<string[]> {
  if (!STUDENT_CREDENTIAL_REGISTRY_ADDRESS) {
    throw new Error("STUDENT_CREDENTIAL_REGISTRY_ADDRESS environment variable is not set");
  }
  if (!isAddress(walletAddress, { strict: false })) return [];

  const logs = await publicClient.getLogs({
    address: STUDENT_CREDENTIAL_REGISTRY_ADDRESS,
    event: STUDENT_CREDENTIAL_REGISTRY_ABI[2],
    args: { student: getAddress(walletAddress) },
  });
  return logs.map((log) => log.args.tokenId?.toString() ?? "").filter((id) => id !== "");
}
