import { describe, it, expect, vi } from "vitest";
import { validateSimulation } from "../validator.js";
import type { GlobalPolicyContext, SimulationConstraints } from "../../types.js";
import type { Rpc, SolanaRpcApi, Address } from "@solana/kit";
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

// Helper to create mock RPC with typed responses
function createMockRpc(simulationResponse: any): Rpc<SolanaRpcApi> {
    return {
        simulateTransaction: vi.fn(() => ({
            send: vi.fn().mockResolvedValue(simulationResponse),
        })),
    } as unknown as Rpc<SolanaRpcApi>;
}

// Helper to create test context
function createTestContext(
    signerAddr = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T",
): GlobalPolicyContext {
    const blockhash = {
        blockhash: "5c9TGe5te815W476jY7Z96PE5844626366663444346134646261393166" as Blockhash,
        lastValidBlockHeight: BigInt(0),
    };
    const payer = address(signerAddr);

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
        transaction: compiled,
        decompiledMessage,
        transactionMessage: "dGVzdA==" as any, // Mock base64 encoded transaction
    };
}

// Mock response builders
const MOCK_RESPONSES = {
    success: () => ({
        value: {
            err: null,
            logs: [
                "Program 11111111111111111111111111111111 invoke [1]",
                "Program 11111111111111111111111111111111 success",
            ],
            accounts: null,
            unitsConsumed: 1000n,
            returnData: null,
        },
        context: { slot: 123456n },
    }),

    error: (errorDetails: any) => ({
        value: {
            err: errorDetails,
            logs: ["Program failed"],
            accounts: null,
            unitsConsumed: 500n,
            returnData: null,
        },
        context: { slot: 123456n },
    }),

    withComputeUnits: (units: bigint) => ({
        value: {
            err: null,
            logs: null,
            accounts: null,
            unitsConsumed: units,
            returnData: null,
        },
        context: { slot: 123456n },
    }),

    withAccount: (lamports: bigint) => ({
        value: {
            err: null,
            logs: null,
            accounts: [
                {
                    data: ["", "base64"] as [string, string],
                    executable: false,
                    lamports,
                    owner: "11111111111111111111111111111111" as Address,
                    rentEpoch: 0n,
                },
            ],
            unitsConsumed: 1000n,
            returnData: null,
        },
        context: { slot: 123456n },
    }),
};

describe("validateSimulation", () => {
    const ctx = createTestContext();

    describe("Simulation Success/Failure", () => {
        it("should pass when simulation succeeds and requireSuccess=true (default)", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.success());

            const result = await validateSimulation({ requireSuccess: true }, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should fail when simulation errors and requireSuccess=true", async () => {
            const mockRpc = createMockRpc(
                MOCK_RESPONSES.error({ InstructionError: [0, { Custom: 42 }] }),
            );

            const result = await validateSimulation({ requireSuccess: true }, ctx, mockRpc);

            expect(result).toContain("Simulation failed");
        });

        it("should pass when simulation errors and requireSuccess=false", async () => {
            const mockRpc = createMockRpc(
                MOCK_RESPONSES.error({ InstructionError: [0, { Custom: 42 }] }),
            );

            const result = await validateSimulation({ requireSuccess: false }, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should use requireSuccess=true as default", async () => {
            const mockRpc = createMockRpc(
                MOCK_RESPONSES.error({ InstructionError: [0, "Error"] }),
            );

            const result = await validateSimulation({}, ctx, mockRpc);

            expect(result).toContain("Simulation failed");
        });
    });

    describe("Compute Units Validation", () => {
        it("should pass when under compute unit limit", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withComputeUnits(150000n));

            const result = await validateSimulation({ maxComputeUnits: 200000 }, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should pass when at exact compute unit limit", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withComputeUnits(200000n));

            const result = await validateSimulation({ maxComputeUnits: 200000 }, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should fail when exceeding compute unit limit", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withComputeUnits(250000n));

            const result = await validateSimulation({ maxComputeUnits: 200000 }, ctx, mockRpc);

            expect(result).toContain("Compute units exceeded");
            expect(result).toContain("250000");
            expect(result).toContain("200000");
        });

        it("should handle null unitsConsumed as 0", async () => {
            const mockRpc = createMockRpc({
                value: {
                    err: null,
                    logs: null,
                    accounts: null,
                    unitsConsumed: null,
                    returnData: null,
                },
                context: { slot: 123456n },
            });

            const result = await validateSimulation({ maxComputeUnits: 100 }, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should allow unlimited compute units when not configured", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withComputeUnits(999999n));

            const result = await validateSimulation({}, ctx, mockRpc);

            expect(result).toBe(true);
        });
    });

    describe("Account Closure Validation", () => {
        it("should pass when account is not closed", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withAccount(1000000n));

            const result = await validateSimulation(
                { forbidSignerAccountClosure: true },
                ctx,
                mockRpc,
            );

            expect(result).toBe(true);
        });

        it("should fail when signer account is closed (0 lamports)", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withAccount(0n));

            const result = await validateSimulation(
                { forbidSignerAccountClosure: true },
                ctx,
                mockRpc,
            );

            expect(result).toContain("closes signer account");
            expect(result).toContain("forbidden");
        });

        it("should pass when account closed but forbidSignerAccountClosure=false", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withAccount(0n));

            const result = await validateSimulation(
                { forbidSignerAccountClosure: false },
                ctx,
                mockRpc,
            );

            expect(result).toBe(true);
        });

        it("should pass when forbidSignerAccountClosure not configured", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withAccount(0n));

            const result = await validateSimulation({}, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should handle missing account data gracefully", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.success()); // No accounts array

            const result = await validateSimulation(
                { forbidSignerAccountClosure: true },
                ctx,
                mockRpc,
            );

            // Should pass when accounts is null (can't verify closure)
            expect(result).toBe(true);
        });
    });

    describe("Combined Constraints", () => {
        it("should validate multiple constraints together", async () => {
            const mockRpc = createMockRpc({
                value: {
                    err: null,
                    logs: ["Success"],
                    accounts: [
                        {
                            data: ["", "base64"],
                            executable: false,
                            lamports: 9500000000n,
                            owner: "11111111111111111111111111111111" as Address,
                            rentEpoch: 0n,
                        },
                    ],
                    unitsConsumed: 150000n,
                    returnData: null,
                },
                context: { slot: 123456n },
            });

            const result = await validateSimulation(
                {
                    requireSuccess: true,
                    maxComputeUnits: 200000,
                    forbidSignerAccountClosure: true,
                },
                ctx,
                mockRpc,
            );

            expect(result).toBe(true);
        });

        it("should fail on first violated constraint", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.withComputeUnits(300000n));

            const result = await validateSimulation(
                {
                    requireSuccess: true,
                    maxComputeUnits: 200000, // This will fail
                    forbidSignerAccountClosure: true, // This wouldn't be reached
                },
                ctx,
                mockRpc,
            );

            expect(result).toContain("Compute units exceeded");
        });
    });

    describe("Edge Cases", () => {
        it("should handle empty constraints object", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.success());

            const result = await validateSimulation({}, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should pass all validations with minimal config", async () => {
            const mockRpc = createMockRpc({
                value: {
                    err: null,
                    logs: null,
                    accounts: null,
                    unitsConsumed: null,
                    returnData: null,
                },
                context: { slot: 123456n },
            });

            const result = await validateSimulation({}, ctx, mockRpc);

            expect(result).toBe(true);
        });

        it("should fail when transactionMessage is missing", async () => {
            const mockRpc = createMockRpc(MOCK_RESPONSES.success());
            const ctxWithoutTxMessage = { ...ctx, transactionMessage: undefined };

            const result = await validateSimulation({}, ctxWithoutTxMessage, mockRpc);

            expect(result).toContain("Simulation requires transactionMessage");
        });
    });
});
