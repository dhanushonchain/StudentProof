// Pure helpers for GET /api/verify: wallet validation, safe response
// bodies, and log redaction. Zero imports — safe to unit-test anywhere.
//
// The route itself keeps using viem's isAddress for format checks; this
// module adds what viem doesn't: the zero-address guard (OpenZeppelin's
// balanceOf reverts on address(0), which would turn client input into a
// 502) and log redaction (viem errors can embed RPC URLs).

export function isZeroAddress(value: string): boolean {
  return /^0x0{40}$/i.test(value);
}

// Exact shape of a successful verification response.
export function verifySuccessBody(valid: boolean): { valid: boolean } {
  return { valid };
}

// Exact shape of every client/server error response on this route.
export function verifyErrorBody(message: string): { error: string } {
  return { error: message };
}

const SECRET_PATTERNS = [
  /(?:https?|wss?):\/\/[^\s"'`]+/gi, // RPC URLs incl. WebSocket transports (may embed credentials)
  /\b0x[a-fA-F0-9]{64}\b/g, // private keys / tx hashes in messages
  /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, // JWT-like tokens
];

// One-line, secret-free summary for server logs. Keeps the error's identity
// (name/code, useful for debugging) while stripping URLs, keys, and tokens
// that viem/RPC errors routinely embed in `message`.
export function safeChainErrorLog(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
  const raw = error instanceof Error ? error.message : String(error);
  const redacted = SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), raw);
  const firstLine = redacted.split("\n", 1)[0] ?? "";
  return `${name} (${code}): ${firstLine.slice(0, 200)}`;
}
