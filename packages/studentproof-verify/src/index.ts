// Typed, dependency-free client for StudentProof's wallet verification API
// (GET /api/verify?wallet=0x...). Works in Node 18+ and browsers (global
// fetch). Zero dependencies — the only transport is the fetch you supply or
// the global one.
//
// SECURITY: your developer API key is a server-side secret. Never bundle
// this client with a real key in browser code — call it from your server
// (or proxy through it) and keep the key in an environment variable.

export const DEFAULT_BASE_URL = "https://studentproof.app";
export const DEFAULT_TIMEOUT_MS = 10_000;

export type VerifyResult = { valid: boolean };

export type VerifyClientOptions = {
  // API base, e.g. "https://studentproof.app". Trailing slashes are ignored.
  baseUrl?: string;
  // Developer secret, sent as the `x-api-key` header. Server-side only.
  apiKey: string;
  // Per-request timeout in milliseconds (default 10_000). AbortError-safe:
  // a timeout always throws VerifyTimeoutError, never a partial result.
  timeoutMs?: number;
  // Custom fetch implementation (testing, proxies, non-global environments).
  fetchImpl?: typeof fetch;
};

export class StudentProofError extends Error {
  readonly status: number | null;
  readonly code: string;
  constructor(message: string, opts: { status?: number | null; code?: string } = {}) {
    super(message);
    this.name = "StudentProofError";
    this.status = opts.status ?? null;
    this.code = opts.code ?? "request_failed";
  }
}

export class InvalidApiKeyError extends StudentProofError {
  constructor() {
    super("Invalid or missing StudentProof API key (HTTP 401).", { status: 401, code: "invalid_api_key" });
    this.name = "InvalidApiKeyError";
  }
}

export class InvalidWalletError extends StudentProofError {
  constructor() {
    super("Malformed wallet address (HTTP 400). Expected a valid EVM address.", {
      status: 400,
      code: "invalid_wallet",
    });
    this.name = "InvalidWalletError";
  }
}

export class RateLimitedError extends StudentProofError {
  readonly retryAfterSec: number | null;
  constructor(retryAfterSec: number | null) {
    super("StudentProof rate limit exceeded (HTTP 429). Back off and retry.", {
      status: 429,
      code: "rate_limited",
    });
    this.name = "RateLimitedError";
    this.retryAfterSec = retryAfterSec;
  }
}

export class VerificationUnavailableError extends StudentProofError {
  constructor(status: number | null = null) {
    // Fail-closed signal: the credential status could not be determined.
    // Callers must NOT treat this as unverified-and-grant or verified — deny
    // the gated action or retry later.
    super("StudentProof verification unavailable — fail closed, do not grant access.", {
      status,
      code: "verification_unavailable",
    });
    this.name = "VerificationUnavailableError";
  }
}

export class VerifyTimeoutError extends StudentProofError {
  constructor(timeoutMs: number) {
    super(`StudentProof verification timed out after ${timeoutMs}ms — fail closed, do not grant access.`, {
      status: null,
      code: "timeout",
    });
    this.name = "VerifyTimeoutError";
  }
}

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS_RE = /^0x0{40}$/i;

export function isWalletFormat(wallet: unknown): wallet is string {
  return typeof wallet === "string" && EVM_ADDRESS_RE.test(wallet) && !ZERO_ADDRESS_RE.test(wallet);
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const secs = Number.parseInt(value, 10);
  return Number.isFinite(secs) && secs > 0 ? secs : null;
}

export class StudentProofClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VerifyClientOptions) {
    if (!options || typeof options.apiKey !== "string" || options.apiKey.length === 0) {
      throw new InvalidApiKeyError();
    }
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new StudentProofError("timeoutMs must be a positive number.", { code: "invalid_option" });
    }
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  // Returns true only if the wallet holds an active, non-expired credential.
  // Throws typed errors for everything else — including when verification is
  // impossible (timeout, 5xx, network failure): fail closed on those paths.
  async verifyWallet(walletAddress: string): Promise<boolean> {
    if (!isWalletFormat(walletAddress)) throw new InvalidWalletError();
    const url = `${this.baseUrl}/api/verify?wallet=${encodeURIComponent(walletAddress)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "GET",
        headers: { "x-api-key": this.apiKey },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new VerifyTimeoutError(this.timeoutMs);
      throw new VerificationUnavailableError();
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) throw new InvalidApiKeyError();
    if (res.status === 400) throw new InvalidWalletError();
    if (res.status === 429) {
      const retryAfterSec =
        typeof res.headers?.get === "function" ? parseRetryAfter(res.headers.get("Retry-After")) : null;
      throw new RateLimitedError(retryAfterSec);
    }
    if (!res.ok) throw new VerificationUnavailableError(res.status);

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new VerificationUnavailableError(res.status);
    }
    if (!body || typeof body !== "object" || typeof (body as { valid?: unknown }).valid !== "boolean") {
      throw new VerificationUnavailableError(res.status);
    }
    return (body as VerifyResult).valid;
  }
}

// One-shot convenience wrapper: verifyWallet without managing a client.
export async function verifyWallet(
  walletAddress: string,
  options: VerifyClientOptions
): Promise<boolean> {
  return new StudentProofClient(options).verifyWallet(walletAddress);
}
