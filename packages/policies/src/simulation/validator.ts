import type { Address } from "@solana/kit";
import type { GlobalPolicyContext, PolicyResult } from "@solana-signer/shared";

/**
 * Configuration for simulation-based validation.
 * These checks require an RPC connection and simulate the transaction.
 */
export interface SimulationConstraints {
    /** Maximum SOL outflow in lamports */
    maxSolOutflowLamports?: bigint;

    /** Maximum token outflow per mint (mint address → amount) */
    maxTokenOutflowByMint?: Record<Address, bigint>;

    /** Forbid account closures */
    forbidAccountClosure?: boolean;

    /** Forbid authority changes */
    forbidAuthorityChanges?: boolean;
}

/**
 * Validates a transaction using simulation.
 * Requires an RPC connection to simulate the transaction.
 *
 * @param constraints - Simulation-based constraints
 * @param ctx - The global policy context
 * @param rpc - RPC client for simulation
 * @returns PolicyResult (true if allowed, string with reason if denied)
 */
export async function validateSimulation(
    constraints: SimulationConstraints,
    ctx: GlobalPolicyContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rpc: unknown, // TODO: Type this properly when we implement RPC integration
): Promise<PolicyResult> {
    // TODO: Implement simulation-based validation
    // 1. Simulate transaction using RPC
    // 2. Analyze pre/post token balances
    // 3. Check for account closures
    // 4. Check for authority changes
    // 5. Validate against constraints

    return true; // Stub for now
}
