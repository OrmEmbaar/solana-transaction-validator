import { describe, it, expect } from "vitest";
import { validateAddressLookups } from "../address-lookup-validation.js";
import type { GlobalValidationContext } from "../../types.js";
import { address, type Address, type CompiledTransactionMessage } from "@solana/kit";

const PAYER = address("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");
const TABLE_1 = address("9YdVSNrDsK91cuGCeN4SoQTyLnFD9nqjJmUvZqFJqNXz");
const TABLE_2 = address("8YdVSNrDsK91cuGCeN4SoQTyLnFD9nqjJmUvZqFJqNX8");
const TABLE_3 = address("7YdVSNrDsK91cuGCeN4SoQTyLnFD9nqjJmUvZqFJqNX7");

// Helper to create a mock legacy transaction context
const createLegacyContext = (): GlobalValidationContext => {
    const compiled: CompiledTransactionMessage = {
        version: "legacy",
        staticAccounts: [PAYER, address("11111111111111111111111111111111")],
        header: {
            numSignerAccounts: 1,
            numReadonlyNonSignerAccounts: 1,
            numReadonlySignerAccounts: 0,
        },
        instructions: [{ programAddressIndex: 1, accountIndices: [], data: new Uint8Array([]) }],
    };

    // We don't need full decompilation for these tests
    const decompiledMessage = {} as GlobalValidationContext["decompiledMessage"];

    return {
        signer: PAYER,
        transaction: compiled,
        decompiledMessage,
    };
};

// Helper to create a mock v0 transaction context with lookup tables
const createV0ContextWithLookups = (
    tables: Array<{ address: Address; readonlyIndexes: number[]; writableIndexes: number[] }>,
): GlobalValidationContext => {
    const compiled: CompiledTransactionMessage = {
        version: 0,
        staticAccounts: [PAYER, address("11111111111111111111111111111111")],
        header: {
            numSignerAccounts: 1,
            numReadonlyNonSignerAccounts: 1,
            numReadonlySignerAccounts: 0,
        },
        instructions: [{ programAddressIndex: 1, accountIndices: [], data: new Uint8Array([]) }],
        addressTableLookups: tables.map((t) => ({
            lookupTableAddress: t.address,
            readonlyIndexes: t.readonlyIndexes,
            writableIndexes: t.writableIndexes,
        })),
    };

    // We don't need full decompilation for these tests
    const decompiledMessage = {} as GlobalValidationContext["decompiledMessage"];

    return {
        signer: PAYER,
        transaction: compiled,
        decompiledMessage,
    };
};

describe("validateAddressLookups", () => {
    describe("legacy transactions", () => {
        it("should allow legacy transactions regardless of config (undefined)", () => {
            const ctx = createLegacyContext();
            const result = validateAddressLookups(undefined, ctx);
            expect(result).toBe(true);
        });

        it("should allow legacy transactions regardless of config (false)", () => {
            const ctx = createLegacyContext();
            const result = validateAddressLookups(false, ctx);
            expect(result).toBe(true);
        });

        it("should allow legacy transactions regardless of config (true)", () => {
            const ctx = createLegacyContext();
            const result = validateAddressLookups(true, ctx);
            expect(result).toBe(true);
        });

        it("should allow legacy transactions regardless of config (object)", () => {
            const ctx = createLegacyContext();
            const result = validateAddressLookups({ allowedTables: [] }, ctx);
            expect(result).toBe(true);
        });
    });

    describe("v0 transactions without lookups", () => {
        it("should allow v0 without lookups (undefined config)", () => {
            const ctx = createV0ContextWithLookups([]);
            const result = validateAddressLookups(undefined, ctx);
            expect(result).toBe(true);
        });

        it("should allow v0 without lookups (false config)", () => {
            const ctx = createV0ContextWithLookups([]);
            const result = validateAddressLookups(false, ctx);
            expect(result).toBe(true);
        });

        it("should allow v0 without lookups (true config)", () => {
            const ctx = createV0ContextWithLookups([]);
            const result = validateAddressLookups(true, ctx);
            expect(result).toBe(true);
        });

        it("should allow v0 without lookups (object config)", () => {
            const ctx = createV0ContextWithLookups([]);
            const result = validateAddressLookups({ maxTables: 0 }, ctx);
            expect(result).toBe(true);
        });
    });

    describe("default behavior (undefined - deny all)", () => {
        it("should reject v0 transactions with lookups by default", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1], writableIndexes: [] },
            ]);
            const result = validateAddressLookups(undefined, ctx);
            expect(result).toContain("not allowed");
            expect(result).toContain("secure by default");
        });
    });

    describe("explicit false (deny all)", () => {
        it("should reject v0 transactions with lookups when false", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
            ]);
            const result = validateAddressLookups(false, ctx);
            expect(result).toContain("not allowed");
        });

        it("should reject even with multiple lookups", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [1] },
            ]);
            const result = validateAddressLookups(false, ctx);
            expect(result).toContain("not allowed");
        });
    });

    describe("explicit true (allow all)", () => {
        it("should allow any lookup tables when true", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1, 2], writableIndexes: [3] },
            ]);
            const result = validateAddressLookups(true, ctx);
            expect(result).toBe(true);
        });

        it("should allow multiple lookup tables when true", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [1, 2] },
                { address: TABLE_3, readonlyIndexes: [3, 4, 5], writableIndexes: [] },
            ]);
            const result = validateAddressLookups(true, ctx);
            expect(result).toBe(true);
        });
    });

    describe("maxTables constraint", () => {
        it("should allow lookups within table limit", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [1] },
            ]);
            const result = validateAddressLookups({ maxTables: 3 }, ctx);
            expect(result).toBe(true);
        });

        it("should allow lookups at exact table limit", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [1] },
            ]);
            const result = validateAddressLookups({ maxTables: 2 }, ctx);
            expect(result).toBe(true);
        });

        it("should reject lookups exceeding table limit", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [1] },
                { address: TABLE_3, readonlyIndexes: [2], writableIndexes: [] },
            ]);
            const result = validateAddressLookups({ maxTables: 2 }, ctx);
            expect(result).toContain("Too many lookup tables");
            expect(result).toContain("3 > 2");
        });
    });

    describe("allowedTables constraint", () => {
        it("should allow table in allowlist", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1], writableIndexes: [] },
            ]);
            const result = validateAddressLookups({ allowedTables: [TABLE_1, TABLE_2] }, ctx);
            expect(result).toBe(true);
        });

        it("should allow multiple tables all in allowlist", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [1] },
            ]);
            const result = validateAddressLookups({ allowedTables: [TABLE_1, TABLE_2] }, ctx);
            expect(result).toBe(true);
        });

        it("should reject table not in allowlist", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_3, readonlyIndexes: [0], writableIndexes: [] },
            ]);
            const result = validateAddressLookups({ allowedTables: [TABLE_1, TABLE_2] }, ctx);
            expect(result).toContain("not in allowlist");
            expect(result).toContain(TABLE_3);
        });

        it("should reject if any table not in allowlist", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_3, readonlyIndexes: [], writableIndexes: [1] },
            ]);
            const result = validateAddressLookups({ allowedTables: [TABLE_1, TABLE_2] }, ctx);
            expect(result).toContain("not in allowlist");
            expect(result).toContain(TABLE_3);
        });

        it("should reject when allowedTables is empty array", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
            ]);
            const result = validateAddressLookups({ allowedTables: [] }, ctx);
            expect(result).toContain("not in allowlist");
        });
    });

    describe("maxIndexedAccounts constraint", () => {
        it("should allow indexed accounts within limit", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1], writableIndexes: [2] }, // 3 total
                { address: TABLE_2, readonlyIndexes: [3], writableIndexes: [4, 5] }, // 3 total
            ]);
            const result = validateAddressLookups({ maxIndexedAccounts: 10 }, ctx);
            expect(result).toBe(true);
        });

        it("should allow indexed accounts at exact limit", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1], writableIndexes: [] }, // 2
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [2, 3] }, // 2
            ]);
            const result = validateAddressLookups({ maxIndexedAccounts: 4 }, ctx);
            expect(result).toBe(true);
        });

        it("should reject indexed accounts exceeding limit", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1, 2], writableIndexes: [3, 4] }, // 5
            ]);
            const result = validateAddressLookups({ maxIndexedAccounts: 4 }, ctx);
            expect(result).toContain("Too many indexed accounts");
            expect(result).toContain("5 > 4");
        });

        it("should count across all tables", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1], writableIndexes: [] }, // 2
                { address: TABLE_2, readonlyIndexes: [2], writableIndexes: [3, 4] }, // 3
                { address: TABLE_3, readonlyIndexes: [], writableIndexes: [5] }, // 1
            ]);
            const result = validateAddressLookups({ maxIndexedAccounts: 5 }, ctx);
            expect(result).toContain("Too many indexed accounts");
            expect(result).toContain("6 > 5");
        });

        it("should allow zero indexed accounts", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [], writableIndexes: [] },
            ]);
            const result = validateAddressLookups({ maxIndexedAccounts: 0 }, ctx);
            expect(result).toBe(true);
        });
    });

    describe("combined constraints", () => {
        it("should enforce all constraints together", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [2] },
            ]);
            const result = validateAddressLookups(
                {
                    allowedTables: [TABLE_1, TABLE_2, TABLE_3],
                    maxTables: 3,
                    maxIndexedAccounts: 10,
                },
                ctx,
            );
            expect(result).toBe(true);
        });

        it("should fail on first violated constraint (allowlist)", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_3, readonlyIndexes: [], writableIndexes: [1] },
            ]);
            const result = validateAddressLookups(
                {
                    allowedTables: [TABLE_1], // TABLE_3 not allowed
                    maxTables: 5,
                    maxIndexedAccounts: 10,
                },
                ctx,
            );
            expect(result).toContain("not in allowlist");
        });

        it("should check maxTables before indexed accounts", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0], writableIndexes: [] },
                { address: TABLE_2, readonlyIndexes: [], writableIndexes: [1] },
                { address: TABLE_3, readonlyIndexes: [2], writableIndexes: [] },
            ]);
            const result = validateAddressLookups(
                {
                    maxTables: 2, // Fails here
                    maxIndexedAccounts: 2, // Would also fail
                },
                ctx,
            );
            expect(result).toContain("Too many lookup tables");
        });
    });

    describe("edge cases", () => {
        it("should handle empty readonlyIndexes and writableIndexes", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [], writableIndexes: [] },
            ]);
            const result = validateAddressLookups(
                {
                    allowedTables: [TABLE_1],
                    maxIndexedAccounts: 0,
                },
                ctx,
            );
            expect(result).toBe(true);
        });

        it("should allow when no constraints are specified in config object", () => {
            const ctx = createV0ContextWithLookups([
                { address: TABLE_1, readonlyIndexes: [0, 1, 2], writableIndexes: [3, 4] },
            ]);
            const result = validateAddressLookups({}, ctx);
            expect(result).toBe(true);
        });
    });
});
