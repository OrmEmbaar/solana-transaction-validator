import { describe, it, expect, vi } from "vitest";
import { createPolicyValidator } from "../policy-engine.js";
import { type Policy } from "@solana-signer/shared";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    setTransactionMessageFeePayer,
    Blockhash,
} from "@solana/kit";

// Helper to create a valid transaction message
const createTestTransaction = (programId = "11111111111111111111111111111111") => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    // Use a distinct, valid address for the fee payer (not a program address)
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
    const denyPolicy: Policy = {
        validate: vi.fn().mockResolvedValue("Denied by policy"),
    };

    it("should allow transaction when valid policies are present", async () => {
        // This test confirms that the engine correctly delegates to a passing policy
        const programId = address("11111111111111111111111111111111");
        const validator = createPolicyValidator({
            programs: {
                [programId]: { validate: () => true },
            },
        });
        const tx = createTestTransaction();

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).resolves.not.toThrow();
    });

    it("should enforce global policies", async () => {
        const programId = address("11111111111111111111111111111111");
        const validator = createPolicyValidator({
            global: [denyPolicy],
            programs: {
                [programId]: { validate: () => true },
            },
        });
        const tx = createTestTransaction();

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow("Denied by policy");
        expect(denyPolicy.validate).toHaveBeenCalled();
    });

    it("should route to program-specific policies", async () => {
        const programId = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const tokenPolicy = { validate: vi.fn().mockResolvedValue(true) };

        const validator = createPolicyValidator({
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
        const tokenPolicy = { validate: vi.fn().mockResolvedValue("Token policy says no") };

        const validator = createPolicyValidator({
            programs: { [programId]: tokenPolicy },
        });

        const tx = createTestTransaction(programId);

        await expect(
            validator(tx, { signer: address("11111111111111111111111111111111") }),
        ).rejects.toThrow("Token policy says no");
    });
});
