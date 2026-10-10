// Runnable checks for lib/verify-request.ts (pure — no I/O, no env).
// Run:
//   ./node_modules/.bin/tsc lib/verify-request.selfcheck.ts lib/verify-request.ts \
//     --outDir /tmp/sp-verify-selfcheck --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-verify-selfcheck/verify-request.selfcheck.js
import assert from "node:assert/strict";
import { isZeroAddress, safeChainErrorLog, verifyErrorBody, verifySuccessBody } from "./verify-request";

// Zero address in any casing is rejected before any chain call (OZ
// balanceOf reverts on address(0), which used to surface as a 502).
assert.equal(isZeroAddress("0x0000000000000000000000000000000000000000"), true);
assert.equal(isZeroAddress("0x0000000000000000000000000000000000000000".toUpperCase()), true);
assert.equal(isZeroAddress("0x000000000000000000000000000000000000dEaD"), false);
assert.equal(isZeroAddress("0x0000000000000000000000000000000000000001"), false);
assert.equal(isZeroAddress("not-an-address"), false);
assert.equal(isZeroAddress(""), false);

// Response shapes are exact: success carries only `valid`, errors only `error`.
assert.deepEqual(verifySuccessBody(true), { valid: true });
assert.deepEqual(verifySuccessBody(false), { valid: false });
assert.deepEqual(Object.keys(verifySuccessBody(true)), ["valid"]);
assert.deepEqual(verifyErrorBody("Failed to read credential status"), { error: "Failed to read credential status" });
assert.deepEqual(Object.keys(verifyErrorBody("x")), ["error"]);

// Log redaction: identity kept, secrets stripped.
{
  const urlError = new Error("fetch failed: https://user:pass@fancy-rpc.example.com/ext/bc/C/rpc");
  (urlError as { code?: string }).code = "ERR_FETCH";
  const logged = safeChainErrorLog(urlError);
  assert.ok(logged.includes("ERR_FETCH"));
  assert.ok(!logged.includes("fancy-rpc.example.com"), logged);
  assert.ok(!logged.includes("user:pass"), logged);
}
{
  // WebSocket transports carry credentials the same way — redacted wholly.
  const wsError = new Error("socket hang up: wss://user:pass@example.com/path");
  (wsError as { code?: string }).code = "ECONNRESET";
  const logged = safeChainErrorLog(wsError);
  assert.ok(logged.includes("ECONNRESET"));
  assert.ok(!logged.includes("example.com"), logged);
  assert.ok(!logged.includes("user"), logged);
  assert.ok(!logged.includes("pass"), logged);
  assert.ok(!logged.includes("wss://"), logged);
}
{
  const keyError = new Error(
    "invalid key 0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd for account"
  );
  const logged = safeChainErrorLog(keyError);
  assert.ok(!logged.includes("0xabcdefab"), logged);
  assert.ok(logged.includes("[redacted]"), logged);
}
{
  // Non-Error inputs and multiline messages degrade gracefully.
  assert.ok(safeChainErrorLog("plain string failure").startsWith("Error (unknown):"));
  const multi = new Error("first line\nsecond line contains https://secret.example.com/x");
  const logged = safeChainErrorLog(multi);
  assert.ok(!logged.includes("\n") && !logged.includes("secret.example.com"), logged);
  assert.ok(logged.length <= "Error (unknown): ".length + 200);
}

console.log("verify-request: all checks passed");
