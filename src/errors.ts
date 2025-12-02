/**
 * Error thrown when transaction validation fails.
 */
export class ValidationError extends Error {
    public readonly details?: Record<string, unknown>;

    constructor(message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = "ValidationError";
        this.details = details;
    }
}
