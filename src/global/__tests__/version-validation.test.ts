import { describe, it, expect } from "vitest";
import { validateTransactionVersion } from "../version-validation.js";
import type { ValidationContext } from "../../types.js";
import {
    address,
    compileTransactionMessage,
    pipe,
    createTransactionMessage,
    setTransactionMessageLifetimeUsingBlockhash,
    setTransactionMessageFeePayer,
    decompileTransactionMessage,
    appendTransactionMessageInstruction,
    type Blockhash,
} from "@solana/kit";
import type { Base64EncodedWireTransaction } from "@solana/kit";

const createV0Context = (): ValidationContext => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

    const msg = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => setTransactionMessageFeePayer(payer, tx),
        (tx) =>
            appendTransactionMessageInstruction(
                {
                    programAddress: address("11111111111111111111111111111111"),
                    accounts: [],
                    data: new Uint8Array([]),
                },
                tx,
            ),
    );

    const compiled = compileTransactionMessage(msg);
    const decompiledMessage = decompileTransactionMessage(compiled);

    return {
        signer: payer,
        transaction: "" as Base64EncodedWireTransaction,
        compiledMessage: compiled,
        decompiledMessage,
    };
};

const createLegacyContext = (): ValidationContext => {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    const payer = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");

    const msg = pipe(
        createTransactionMessage({ version: "legacy" }),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
        (tx) => setTransactionMessageFeePayer(payer, tx),
        (tx) =>
            appendTransactionMessageInstruction(
                {
                    programAddress: address("11111111111111111111111111111111"),
                    accounts: [],
                    data: new Uint8Array([]),
                },
                tx,
            ),
    );

    const compiled = compileTransactionMessage(msg);
    const decompiledMessage = decompileTransactionMessage(compiled);

    return {
        signer: payer,
        transaction: "" as Base64EncodedWireTransaction,
        compiledMessage: compiled,
        decompiledMessage,
    };
};

describe("validateTransactionVersion", () => {
    describe("default (v0 only)", () => {
        it("should allow v0 transactions by default", () => {
            const ctx = createV0Context();
            const result = validateTransactionVersion(undefined, ctx);
            expect(result).toBe(true);
        });

        it("should reject legacy transactions by default", () => {
            const ctx = createLegacyContext();
            const result = validateTransactionVersion(undefined, ctx);
            expect(result).toContain("legacy");
            expect(result).toContain("Allowed: [0]");
        });
    });

    describe("v0 only", () => {
        it("should allow v0 transactions", () => {
            const ctx = createV0Context();
            const result = validateTransactionVersion([0], ctx);
            expect(result).toBe(true);
        });

        it("should reject legacy transactions", () => {
            const ctx = createLegacyContext();
            const result = validateTransactionVersion([0], ctx);
            expect(result).toContain("legacy");
            expect(result).toContain("Allowed: [0]");
        });
    });

    describe("legacy only", () => {
        it("should allow legacy transactions", () => {
            const ctx = createLegacyContext();
            const result = validateTransactionVersion(["legacy"], ctx);
            expect(result).toBe(true);
        });

        it("should reject v0 transactions", () => {
            const ctx = createV0Context();
            const result = validateTransactionVersion(["legacy"], ctx);
            expect(result).toContain("0");
            expect(result).toContain("Allowed: [legacy]");
        });
    });

    describe("multiple versions", () => {
        it("should allow v0 when both allowed", () => {
            const ctx = createV0Context();
            const result = validateTransactionVersion([0, "legacy"], ctx);
            expect(result).toBe(true);
        });

        it("should allow legacy when both allowed", () => {
            const ctx = createLegacyContext();
            const result = validateTransactionVersion([0, "legacy"], ctx);
            expect(result).toBe(true);
        });
    });
});
