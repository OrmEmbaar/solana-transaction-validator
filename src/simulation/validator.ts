import type { Rpc, SolanaRpcApi } from "@solana/kit";
import type { GlobalPolicyContext, PolicyResult, SimulationConstraints } from "../types.js";

/**
 * Validates a transaction using RPC simulation.
 * Called internally by the policy engine when simulation config is provided.
 *
 * Note: Requires `transactionMessage` (base64 encoded wire transaction) to be
 * provided in the GlobalPolicyContext for simulation to work.
 *
 * @param constraints - Simulation-based constraints
 * @param ctx - The global policy context
 * @param rpc - RPC client for running simulations
 * @returns PolicyResult (true if allowed, string with reason if denied)
 */
export async function validateSimulation(
    constraints: SimulationConstraints,
    ctx: GlobalPolicyContext,
    rpc: Rpc<SolanaRpcApi>,
): Promise<PolicyResult> {
    // 1. Get base64 encoded transaction
    // Require transactionMessage to be provided in context
    if (!ctx.transactionMessage) {
        return "Simulation requires transactionMessage in context";
    }
    const encodedTransaction = ctx.transactionMessage;

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
            return `Simulation failed: ${JSON.stringify(simulation.value.err)}`;
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
