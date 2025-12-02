/**
 * Error thrown when transaction policy validation fails.
 */
export class PolicyValidationError extends Error {
    public readonly details?: Record<string, unknown>;

    constructor(message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = "PolicyValidationError";
        this.details = details;
    }
}
