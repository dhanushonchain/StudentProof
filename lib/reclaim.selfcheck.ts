// Runnable checks for lib/reclaim.ts's extractProgrammeInfo — no test
// framework in this project yet, so this is a plain assert-based script,
// same pattern as lib/programme-expiry.selfcheck.ts.
//
// Run (the dummy credentials only satisfy the module's import-time env
// presence check; no network calls are made — extraction is pure).
// `server-only` needs a stub under plain node (Next.js aliases it to an
// empty module on the server; the stub mirrors that):
//   mkdir -p /tmp/sp-stubs/node_modules/server-only
//   printf '{"main":"index.js"}' > /tmp/sp-stubs/node_modules/server-only/package.json
//   printf 'module.exports = {};\n' > /tmp/sp-stubs/node_modules/server-only/index.js
//   export RECLAIM_APP_ID=selfcheck-dummy RECLAIM_APP_SECRET=selfcheck-dummy \
//     NODE_PATH=/tmp/sp-stubs/node_modules
//   ./node_modules/.bin/tsc lib/reclaim.selfcheck.ts lib/reclaim.ts \
//     --outDir /tmp/sp-reclaim-selfcheck --module commonjs --target es2020 \
//     --moduleResolution node --skipLibCheck --strict --esModuleInterop \
//   && node /tmp/sp-reclaim-selfcheck/reclaim.selfcheck.js
import assert from "node:assert/strict";
import { extractProgrammeInfo } from "./reclaim";

function proofWithParameters(parameters: string) {
  return { claimData: { parameters } };
}

// Provider shape WITH programme fields (observed on an earlier provider
// version — real captured SAMARTH example, see git history of
// lib/programme-duration.json): extraction succeeds. Issuance uses only the
// derived 1-year expiry, never these raw values.
{
  const proof = proofWithParameters(
    JSON.stringify({
      paramValues: { enrolmentnumber: "oprf-hashed-value", programmecode: "1151061", admissionyearcycle: "2024-JULY" },
    })
  );
  assert.deepEqual(extractProgrammeInfo(proof), { programmeCode: "1151061", admissionCycle: "2024-JULY" });
}

// Provider shape WITHOUT programme fields (enrolment-only, the suspected
// current-provider shape): extraction returns undefined — and since
// issuance no longer depends on it, this shape must still lead to a mint
// attempt (see markVerified in lib/verification-db.ts; that wiring is
// verified by inspection because it requires a database).
{
  const proof = proofWithParameters(JSON.stringify({ paramValues: { enrolmentnumber: "oprf-hashed-value" } }));
  assert.equal(extractProgrammeInfo(proof), undefined);
}

// Malformed parameters JSON: no throw, treated as absent.
{
  assert.equal(extractProgrammeInfo(proofWithParameters("not-json{{")), undefined);
}

// Empty paramValues: absent, not an error.
{
  assert.equal(extractProgrammeInfo(proofWithParameters(JSON.stringify({ paramValues: {} }))), undefined);
}

console.log("reclaim extractProgrammeInfo: all checks passed");
