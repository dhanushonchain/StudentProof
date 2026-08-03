// Computes a credential's issuedAt/expiresAt from the student's programme
// code + admission cycle. Callers must discard programmeCode/admissionCycle
// immediately after calling this — only the returned dates are allowed to
// be stored, minted, or logged (see StudentProof's privacy rules).
import programmeDurations from "./programme-duration.json";

// Only JULY is confirmed against a real captured SAMARTH page this session.
// JANUARY is the conventional Indian university even-semester intake month —
// included as a reasonable guess, NOT independently verified against real
// SAMARTH data. Any other cycle name fails fast rather than guessing.
const CYCLE_START_MONTH: Record<string, number> = {
  JULY: 6,
  JANUARY: 0,
};

export class UnknownProgrammeCodeError extends Error {
  constructor(programmeCode: string) {
    super(
      `No programme duration configured for programme code "${programmeCode}" — add it to lib/programme-duration.json before this can be verified.`
    );
    this.name = "UnknownProgrammeCodeError";
  }
}

export class UnknownAdmissionCycleError extends Error {
  constructor(cycle: string) {
    super(`Unrecognized admission cycle "${cycle}" — expected a known cycle name (e.g. JULY) in CYCLE_START_MONTH.`);
    this.name = "UnknownAdmissionCycleError";
  }
}

export function computeCredentialExpiry(
  programmeCode: string,
  admissionCycle: string,
  now: Date = new Date()
): { issuedAt: Date; expiresAt: Date } {
  const durationYears = (programmeDurations as Record<string, number>)[programmeCode];
  if (durationYears === undefined) {
    throw new UnknownProgrammeCodeError(programmeCode);
  }

  const match = /^(\d{4})-([A-Z]+)$/.exec(admissionCycle);
  if (!match) {
    throw new Error(`Malformed admission cycle "${admissionCycle}" — expected "<year>-<CYCLE>", e.g. "2024-JULY".`);
  }
  const [, yearStr, cycleName] = match;
  const startMonth = CYCLE_START_MONTH[cycleName];
  if (startMonth === undefined) {
    throw new UnknownAdmissionCycleError(cycleName);
  }

  const admissionYear = Number(yearStr);
  // Date.UTC correctly rolls the month into the following year(s) — real
  // calendar math, not string concatenation.
  const expiresAt = new Date(Date.UTC(admissionYear + durationYears, startMonth, 1));

  return { issuedAt: now, expiresAt };
}
