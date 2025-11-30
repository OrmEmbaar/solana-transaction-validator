import { describe, it, expect, vi } from "vitest";
import { createPolicyValidator } from "../engine.js";
import { type InstructionPolicy, SignerRole } from "../types.js";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    setTransactionMessageFeePayer,
    type Blockhash,
} from "@solana/kit";

// Helper to create a valid transaction message
const createTestTransaction = (programId = "11111111111111111111111111111111") => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    // Use a distinct, valid address for the fee payer
    const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

    return pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) =>
            appendTransactionMessageInstruction(
                {
                    programAddress: address(programId),
                    accounts: [],
                    data: new Uint8Array([]),
                },
                tx,
            ),
        (tx) => setTransactionMessageFeePayer(payer, tx),
        compileTransactionMessage,
    );
};

describe("PolicyEngine", () => {
    const mockInstructionPolicy: InstructionPolicy = {
        validate: vi.fn().mockResolvedValue(true),
    };

    it("should allow transaction when program policy passes", async () => {
        const programId = address("11111111111111111111111111111111");
        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: {
                [programId]: mockInstructionPolicy,
            },
        });
        const tx = createTestTransaction();

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).resolves.not.toThrow();
    });

    it("should route to program-specific policies", async () => {
        const programId = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const tokenPolicy: InstructionPolicy = {
            validate: vi.fn().mockResolvedValue(true),
        };

        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: { [programId]: tokenPolicy },
        });

        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).resolves.not.toThrow();

        expect(tokenPolicy.validate).toHaveBeenCalled();
    });

    it("should deny unknown programs (strict allowlist)", async () => {
        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: {}, // No programs allowed
        });

        const programId = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow(/unauthorized program/);
    });

    it("should fail if a program policy returns false", async () => {
        const programId = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const tokenPolicy: InstructionPolicy = {
            validate: vi.fn().mockResolvedValue("Token policy says no"),
        };

        const validator = createPolicyValidator({
            global: {
                signerRole: SignerRole.Any,
            },
            programs: { [programId]: tokenPolicy },
        });

        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow("Token policy says no");
    });
});
