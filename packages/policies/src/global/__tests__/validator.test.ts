import { describe, it, expect } from "vitest";
import { validateGlobalPolicy } from "../validator.js";
import type { GlobalPolicyConfig, GlobalPolicyContext } from "@solana-signer/shared";
import { SignerRole } from "@solana-signer/shared";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    setTransactionMessageFeePayer,
    decompileTransactionMessage,
    type Blockhash,
    appendTransactionMessageInstructions,
} from "@solana/kit";

// Helper to create a test context
const createTestContext = (
    signerAddr = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
    numInstructions = 1,
): GlobalPolicyContext => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

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
            const ctx = createTestContext("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T", 3);

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });

        it("should reject transaction exceeding instruction limit", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxInstructions: 2,
            };
            const ctx = createTestContext("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T", 5);

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

    describe("Signer Role (Stub Behavior)", () => {
        it("should accept any signer role when mode is Any", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
            };
            const ctx = createTestContext();

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });

        it("should accept FeePayerOnly mode (stub implementation)", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.FeePayerOnly,
            };
            const ctx = createTestContext();

            // Stub accepts all for now
            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });

        it("should accept ParticipantOnly mode (stub implementation)", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.ParticipantOnly,
            };
            const ctx = createTestContext();

            // Stub accepts all for now
            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });
    });

    describe("Combined Constraints", () => {
        it("should validate multiple constraints together", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxInstructions: 10,
                maxSignatures: 5,
            };
            const ctx = createTestContext("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T", 3);

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toBe(true);
        });

        it("should fail on first violated constraint", () => {
            const config: GlobalPolicyConfig = {
                signerRole: SignerRole.Any,
                maxInstructions: 2, // This will fail
                maxSignatures: 0, // This would also fail, but shouldn't be reached
            };
            const ctx = createTestContext("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T", 5);

            const result = validateGlobalPolicy(config, ctx);
            expect(result).toContain("Too many instructions");
            expect(result).not.toContain("signatures"); // Should short-circuit
        });
    });
});
