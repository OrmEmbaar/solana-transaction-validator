export const SignerErrorCode = {
    AUTH_FAILED: "AUTH_FAILED",
    POLICY_REJECTED: "POLICY_REJECTED",
    INVALID_REQUEST: "INVALID_REQUEST",
    SIMULATION_FAILED: "SIMULATION_FAILED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
    KEY_NOT_FOUND: "KEY_NOT_FOUND",
} as const;

export type SignerErrorCode = (typeof SignerErrorCode)[keyof typeof SignerErrorCode];

export interface SignerErrorBody {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export class RemoteSignerError extends Error {
    public readonly code: string;
    public readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = "RemoteSignerError";
        this.code = code;
        this.details = details;
    }

    static fromBody(body: SignerErrorBody): RemoteSignerError {
        return new RemoteSignerError(body.code, body.message, body.details);
    }

    toBody(): SignerErrorBody {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
        };
    }
}

