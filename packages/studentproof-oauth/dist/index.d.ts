export declare const DEFAULT_BASE_URL = "https://studentproof.app";
export declare const DEFAULT_TIMEOUT_MS = 10000;
export type AuthorizeUrlOptions = {
    baseUrl?: string;
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    mode?: "signin" | "signup";
};
export type PkcePair = {
    verifier: string;
    challenge: string;
};
export declare function buildAuthorizeUrl(options: AuthorizeUrlOptions): string;
export declare function generateState(): string;
export declare function createPkcePair(): Promise<PkcePair>;
export declare class StudentProofOAuthError extends Error {
    readonly status: number | null;
    readonly code: string;
    constructor(message: string, opts?: {
        status?: number | null;
        code?: string;
    });
}
export declare class InvalidClientError extends StudentProofOAuthError {
    constructor();
}
export declare class InvalidGrantError extends StudentProofOAuthError {
    constructor();
}
export declare class InvalidRequestError extends StudentProofOAuthError {
    constructor();
}
export declare class RateLimitedError extends StudentProofOAuthError {
    readonly retryAfterSec: number | null;
    constructor(retryAfterSec: number | null);
}
export declare class VerificationUnavailableError extends StudentProofOAuthError {
    constructor(status?: number | null);
}
export declare class InvalidAssertionError extends StudentProofOAuthError {
    constructor();
}
export type ExchangeOptions = {
    baseUrl?: string;
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret: string;
    codeVerifier: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
};
export type ExchangeResult = {
    assertion: string;
    expiresIn: number;
};
export declare function exchangeAuthorizationCode(options: ExchangeOptions): Promise<ExchangeResult>;
