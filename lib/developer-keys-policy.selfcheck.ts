// Runnable checks for lib/developer-keys-policy.ts (pure — no I/O, no env).
// Run:
//   ./node_modules/.bin/tsc lib/developer-keys-policy.selfcheck.ts lib/developer-keys-policy.ts \
//     --outDir /tmp/sp-devkeys-selfcheck --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-devkeys-selfcheck/developer-keys-policy.selfcheck.js
import assert from "node:assert/strict";
import {
  API_KEY_LABEL_MAX_LENGTH,
  API_KEY_PREFIX,
  keyPrefixForDisplay,
  toApiKeyStatus,
  validateApiKeyLabel,
} from "./developer-keys-policy";

// Labels: trimmed, length-capped, no control characters. Errors are
// display-safe (labels never contain secrets by construction).
assert.equal(validateApiKeyLabel("  Production  "), "Production");
assert.equal(validateApiKeyLabel("a".repeat(API_KEY_LABEL_MAX_LENGTH)).length, API_KEY_LABEL_MAX_LENGTH);
assert.throws(() => validateApiKeyLabel(""), /empty/);
assert.throws(() => validateApiKeyLabel("   "), /empty/);
assert.throws(() => validateApiKeyLabel("a".repeat(API_KEY_LABEL_MAX_LENGTH + 1)), /at most/);
assert.throws(() => validateApiKeyLabel("bad\nlabel"), /invalid characters/);
assert.throws(() => validateApiKeyLabel("bad\ttab"), /invalid characters/);
assert.throws(() => validateApiKeyLabel(42), /must be a string/);
assert.throws(() => validateApiKeyLabel(null), /must be a string/);
assert.throws(() => validateApiKeyLabel(undefined), /must be a string/);

// Display prefix: short, deterministic, and useless for authentication.
const raw = `${API_KEY_PREFIX}abcdef1234567890abcdef1234567890abcdef1234567890abcdef12`;
const prefix = keyPrefixForDisplay(raw);
assert.equal(prefix, raw.slice(0, 12));
assert.ok(prefix.length < raw.length, "prefix must never carry the full secret");
assert.ok(raw.startsWith(prefix), "prefix must identify the key visually");

// Status derivation: any revocation timestamp means revoked.
assert.equal(toApiKeyStatus(null), "active");
assert.equal(toApiKeyStatus(undefined), "active");
assert.equal(toApiKeyStatus(new Date()), "revoked");
assert.equal(toApiKeyStatus(new Date().toISOString()), "revoked");

console.log("developer-keys-policy: all checks passed");
