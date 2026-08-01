import "server-only";

const appId = process.env.RECLAIM_APP_ID;
const appSecret = process.env.RECLAIM_APP_SECRET;

if (!appId) {
  throw new Error("RECLAIM_APP_ID environment variable is not set");
}
if (!appSecret) {
  throw new Error("RECLAIM_APP_SECRET environment variable is not set");
}

export const RECLAIM_APP_ID = appId;
export const RECLAIM_APP_SECRET = appSecret;

// Published Reclaim provider for Mumbai University's SAMARTH portal — proves
// the enrollment number via a server-side OPRF hash (oprf-raw), so the raw
// number is never sent to StudentProof or the attestor, only a commitment.
export const SAMARTH_PROVIDER_ID = "c731294f-7ac7-4083-8609-7c3785a883e1";
