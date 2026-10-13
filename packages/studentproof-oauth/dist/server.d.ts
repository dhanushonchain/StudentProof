export type StudentResult = {
    valid: boolean;
    sub: string;
};
export type VerifyAssertionOptions = {
    baseUrl?: string;
    jwksUrl?: string;
    assertion: string;
    expectedAud: string;
    expectedIss: string;
    nowSec?: number;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
};
export declare function verifyStudentAssertion(options: VerifyAssertionOptions): Promise<StudentResult>;
