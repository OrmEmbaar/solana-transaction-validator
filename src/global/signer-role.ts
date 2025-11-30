import { SignerRole, type GlobalPolicyContext, type PolicyResult } from "../types.js";
import { isInstructionWithAccounts } from "@solana/kit";

/**
 * Validates the signer's role in the transaction.
 *
 * @param role - The required signer role
 * @param ctx - The global policy context
 * @returns PolicyResult (true if allowed, string with reason if denied)
 */
export function validateSignerRole(role: SignerRole, ctx: GlobalPolicyContext): PolicyResult {
    // Determine if signer is the fee payer
    const isFeePayer = ctx.decompiledMessage.feePayer.address === ctx.signer;

    // Determine if signer appears in any instruction accounts (participant)
    const isParticipant = ctx.decompiledMessage.instructions.some((ix) => {
        if (!isInstructionWithAccounts(ix)) return false;
        // ix.accounts is now guaranteed to be an array of AccountMeta objects
        // Each AccountMeta has an { address: Address, ...other props }
        return ix.accounts.some((acc) => acc.address === ctx.signer);
    });

    switch (role) {
        case SignerRole.FeePayerOnly:
            if (!isFeePayer) {
                return "Signer must be the fee payer";
            }
            if (isParticipant) {
                return "Signer can only be fee payer, not a participant";
            }
            return true;

        case SignerRole.ParticipantOnly:
            if (isFeePayer) {
                return "Signer cannot be the fee payer";
            }
            if (!isParticipant) {
                return "Signer must be a participant";
            }
            return true;

        case SignerRole.Any:
            return true; // No restriction

        default:
            // Exhaustiveness check
            role satisfies never;
            return `Unknown signer role: ${role}`;
    }
}
