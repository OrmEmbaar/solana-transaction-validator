/**
 * Error thrown when transaction validation fails.
 *
 * Contains a descriptive message explaining why validation failed.
 * Optionally includes structured details for programmatic handling.
 *
 * @example
 * ```typescript
 * import { ValidationError } from "solana-transaction-validator";
 *
 * try {
 *     await validator(transaction, context);
 * } catch (error) {
 *     if (error instanceof ValidationError) {
 *         console.error(error.message);
 *         // "System Program: TransferSol amount 2000000000 exceeds limit 1000000000"
 *         // "Instruction 0 uses unauthorized program TokenkegQfe..."
 *         // "Signer must be the fee payer"
 *     }
 * }
 * ```
 */
export class ValidationError extends Error {
    /** Optional structured details about the validation failure */
    public readonly details?: Record<string, unknown>;

    constructor(message: string, details?: Record<string, unknown>) {
        super(message);
        this.name = "ValidationError";
        this.details = details;
    }
}
