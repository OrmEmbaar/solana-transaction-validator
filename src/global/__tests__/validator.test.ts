import { describe, it, expect } from "vitest";
import { validateGlobalPolicy } from "../validator.js";
import type { GlobalPolicyConfig, GlobalPolicyContext } from "../../types.js";
import { SignerRole } from "../../types.js";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    setTransactionMessageFeePayer,
    decompileTransactionMessage,
    appendTransactionMessageInstructions,
    appendTransactionMessageInstruction,
    type Blockhash,
} from "@solana/kit";

// Helper to create a test context
const createTestContext = (
    signerAddr = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    feePayerAddr = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    numInstructions = 1,
): GlobalPolicyContext => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    const payer = address(feePayerAddr);

    // Build instructions array
    const instructions = Array.from({ length: numInstructions }, () => ({
        programAddress: address("11111111111111111111111111111111"),
        accounts: [] as const,
        data: new Uint8Array([]),
    }));

    // Build message with all instructions in one pipe chain
    const msg = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => setTransactionMessageFeePayer(payer, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx),
    );

    const compiled = compileTransactionMessage(msg);
    const decompiledMessage = decompileTransactionMessage(compiled);

    return {
        signer: address(signerAddr),
        transaction: compiled,
        decompiledMessage,
    };
};

describe("validateGlobalPolicy", () => {
    describe("Transaction Limits", () => {
        it("should allow transaction within instruction limit", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxInstructions: 5,
            };
            const ctx = createTestContext(
                "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
                undefined,
                3,
            );

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });

        it("should reject transaction exceeding instruction limit", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxInstructions: 2,
            };
            const ctx = createTestContext(
                "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
                undefined,
                5,
            );

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toContain("Too many instructions");
        });

        it("should allow transaction within signature limit", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxSignatures: 5,
            };
            const ctx = createTestContext();

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });
    });

    describe("Signer Role Validation", () => {
        it("should accept any signer role when mode is Any", () => {
            const signerAddr = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

            // Test as fee payer
            const ctxAsFeePayer = createTestContext(signerAddr, signerAddr);
            expect(validateGlobalPolicy({ signerRole: SignerRole.Any }, ctxAsFeePayer)).toBe(true);

            // Test as non-fee payer
            const ctxAsNonFeePayer = createTestContext(
                signerAddr,
                "5Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
            );
            expect(validateGlobalPolicy({ signerRole: SignerRole.Any }, ctxAsNonFeePayer)).toBe(
                true,
            );
        });

        it("should require signer to be fee payer when mode is FeePayerOnly", () => {
            const signerAddr = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

            // Test: signer IS fee payer (should pass)
            const ctxAsFeePayer = createTestContext(signerAddr, signerAddr);
            expect(
                validateGlobalPolicy({ signerRole: SignerRole.FeePayerOnly }, ctxAsFeePayer),
            ).toBe(true);

            // Test: signer is NOT fee payer (should fail)
            const ctxAsNonFeePayer = createTestContext(
                signerAddr,
                "5Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
            );
            const result = validateGlobalPolicy(
                { signerRole: SignerRole.FeePayerOnly },
                ctxAsNonFeePayer,
            );
            expect(result).toBe("Signer must be the fee payer");
        });

        it("should prohibit signer as fee payer when mode is ParticipantOnly", () => {
            const signerAddr = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

            // Test: signer is NOT fee payer AND is participant (should pass)
            const blockhash = {
                blockhash:
                    "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
                lastValidBlockHeight: BigInt(0),
            };
            const msg = pipe(
                createTransactionMessage({ version: 0 }),
                (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
                (tx) =>
                    setTransactionMessageFeePayer(
                        address("5Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T"),
                        tx,
                    ),
                (tx) =>
                    appendTransactionMessageInstruction(
                        {
                            programAddress: address("11111111111111111111111111111111"),
                            accounts: [
                                {
                                    address: address(signerAddr),
                                    role: 0,
                                },
                            ],
                            data: new Uint8Array([]),
                        },
                        tx,
                    ),
            );
            const compiled = compileTransactionMessage(msg);
            const decompiledMessage = decompileTransactionMessage(compiled);
            const ctxAsParticipant: GlobalPolicyContext = {
                signer: address(signerAddr),
                transaction: compiled,
                decompiledMessage,
            };

            expect(
                validateGlobalPolicy({ signerRole: SignerRole.ParticipantOnly }, ctxAsParticipant),
            ).toBe(true);

            // Test: signer IS fee payer (should fail)
            const ctxAsFeePayer = createTestContext(signerAddr, signerAddr);
            const result = validateGlobalPolicy(
                { signerRole: SignerRole.ParticipantOnly },
                ctxAsFeePayer,
            );
            expect(result).toBe("Signer cannot be the fee payer");
        });

        // TODO: Add test for FeePayerOnly rejecting participant once AccountMeta type issue is resolved
    });

    describe("Combined Constraints", () => {
        it("should validate multiple constraints together", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxInstructions: 10,
                maxSignatures: 5,
            };
            const ctx = createTestContext(
                "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
                undefined,
                3,
            );

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });

        it("should fail on first violated constraint", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxInstructions: 2, // This will fail
                maxSignatures: 0, // This would also fail, but shouldn't be reached
            };
            const ctx = createTestContext(
                "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
                undefined,
                5,
            );

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toContain("Too many instructions");
            expect(result).not.toContain("signatures"); // Should short-circuit
        });
    });
});

