import type { Rpc, SolanaRpcApi } from "@solana/kit";
import type { ValidationContext, ValidationResult, SimulationConstraints } from "../types.js";

/**
 * Validates a transaction using RPC simulation.
 * Called internally by the policy engine when simulation config is provided.
 *
 * @param constraints - Simulation-based constraints
 * @param ctx - The validation context (includes base64 wire transaction)
 * @param rpc - RPC client for running simulations
 * @returns ValidationResult (true if allowed, string with reason if denied)
 */
export async function validateSimulation(
    constraints: SimulationConstraints,
    ctx: ValidationContext,
    rpc: Rpc<SolanaRpcApi>,
): Promise<ValidationResult> {
    // Use the base64-encoded wire transaction from context
    const encodedTransaction = ctx.transaction;

    try {
        // 2. Run simulation with signer account inspection
        const simulation = await rpc
            .simulateTransaction(encodedTransaction, {
                encoding: "base64",
                commitment: "confirmed",
                replaceRecentBlockhash: true, // Allow simulation with any blockhash
                accounts: {
                    encoding: "base64",
                    addresses: [ctx.signer],
                },
            })
            .send();

        // 3. Check for simulation errors
        const requireSuccess = constraints.requireSuccess ?? true;
        if (requireSuccess && simulation.value.err) {
            // Format error for readability
            const errorMsg =
                typeof simulation.value.err === "object"
                    ? JSON.stringify(simulation.value.err, (_, v) =>
                          typeof v === "bigint" ? v.toString() : v,
                      )
                    : String(simulation.value.err);
            return `Simulation failed: ${errorMsg}`;
        }

        // 4. Validate compute units
        if (constraints.maxComputeUnits !== undefined) {
            const unitsConsumed = Number(simulation.value.unitsConsumed ?? 0n);
            if (unitsConsumed > constraints.maxComputeUnits) {
                return `Compute units exceeded: ${unitsConsumed} > ${constraints.maxComputeUnits}`;
            }
        }

        // 5. Validate account closure
        if (constraints.forbidSignerAccountClosure && simulation.value.accounts) {
            const signerAccount = simulation.value.accounts[0];
            if (signerAccount && signerAccount.lamports === 0n) {
                return "Transaction closes signer account (forbidden)";
            }
        }

        return true;
    } catch (error) {
        return `Simulation failed: ${error}`;
    }
}
