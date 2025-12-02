import {
    type Address,
    type Instruction,
    type InstructionWithAccounts,
    type InstructionWithData,
    type AccountMeta,
    assertIsInstructionForProgram,
    assertIsInstructionWithData,
    assertIsInstructionWithAccounts,
} from "@solana/kit";
import {
    SYSTEM_PROGRAM_ADDRESS,
    SystemInstruction,
    identifySystemInstruction,
    parseTransferSolInstruction,
    parseCreateAccountInstruction,
    parseAssignInstruction,
    parseAllocateInstruction,
    parseCreateAccountWithSeedInstruction,
    parseAllocateWithSeedInstruction,
    parseAssignWithSeedInstruction,
    parseTransferSolWithSeedInstruction,
} from "@solana-program/system";
import type {
    InstructionPolicyContext,
    PolicyResult,
    ProgramPolicy,
    ProgramPolicyConfig,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { SYSTEM_PROGRAM_ADDRESS, SystemInstruction };

// Program-specific context type
export type SystemProgramPolicyContext = InstructionPolicyContext<typeof SYSTEM_PROGRAM_ADDRESS>;

// Type for a fully validated instruction
type ValidatedInstruction = Instruction &
    InstructionWithData<Uint8Array> &
    InstructionWithAccounts<readonly AccountMeta[]>;

// ============================================================================
// Per-instruction config types
// ============================================================================

/** Config for TransferSol and TransferSolWithSeed instructions */
export interface TransferSolConfig {
    /** Maximum transfer amount in lamports */
    maxLamports?: bigint;
    /** Allowlist of destination addresses */
    allowedDestinations?: Address[];
}

/** Config for CreateAccount and CreateAccountWithSeed instructions */
export interface CreateAccountConfig {
    /** Maximum lamports to fund the new account */
    maxLamports?: bigint;
    /** Maximum space to allocate */
    maxSpace?: bigint;
    /** Allowlist of programs that can own the created account */
    allowedOwnerPrograms?: Address[];
}

/** Config for Assign and AssignWithSeed instructions */
export interface AssignConfig {
    /** Allowlist of programs that can be assigned as owner */
    allowedOwnerPrograms?: Address[];
}

/** Config for Allocate and AllocateWithSeed instructions */
export interface AllocateConfig {
    /** Maximum space to allocate */
    maxSpace?: bigint;
}

/** Empty config for instructions with no additional constraints */
export type NoConstraintsConfig = Record<string, never>;

/** Map instruction types to their config types */
export interface SystemInstructionConfigs {
    [SystemInstruction.TransferSol]: TransferSolConfig;
    [SystemInstruction.TransferSolWithSeed]: TransferSolConfig;
    [SystemInstruction.CreateAccount]: CreateAccountConfig;
    [SystemInstruction.CreateAccountWithSeed]: CreateAccountConfig;
    [SystemInstruction.Assign]: AssignConfig;
    [SystemInstruction.AssignWithSeed]: AssignConfig;
    [SystemInstruction.Allocate]: AllocateConfig;
    [SystemInstruction.AllocateWithSeed]: AllocateConfig;
    // Nonce operations - no additional config needed
    [SystemInstruction.AdvanceNonceAccount]: NoConstraintsConfig;
    [SystemInstruction.WithdrawNonceAccount]: NoConstraintsConfig;
    [SystemInstruction.InitializeNonceAccount]: NoConstraintsConfig;
    [SystemInstruction.AuthorizeNonceAccount]: NoConstraintsConfig;
    [SystemInstruction.UpgradeNonceAccount]: NoConstraintsConfig;
}

// ============================================================================
// Main config type
// ============================================================================

/**
 * Configuration for the System Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic
 */
export interface SystemProgramPolicyConfig extends ProgramPolicyConfig<
    typeof SYSTEM_PROGRAM_ADDRESS,
    SystemInstruction,
    SystemInstructionConfigs
> {
    /**
     * Requirements for this program in the transaction.
     * - `true`: Program MUST be present in the transaction.
     * - `SystemInstruction[]`: Program MUST be present AND contain these instruction types.
     * - `undefined`: Program is optional (policy runs only if present).
     */
    required?: boolean | SystemInstruction[];
}

// ============================================================================
// Policy implementation
// ============================================================================

/**
 * Creates a policy for the System Program.
 *
 * Uses the official @solana-program/system package for instruction identification
 * and parsing, ensuring accurate discriminator matching and data extraction.
 *
 * @param config - The System Program policy configuration
 * @returns A ProgramPolicy that validates System Program instructions
 *
 * @example
 * ```typescript
 * const systemPolicy = createSystemProgramPolicy({
 *     instructions: {
 *         // Declarative: use built-in constraints
 *         [SystemInstruction.TransferSol]: {
 *             maxLamports: 1_000_000_000n, // 1 SOL max
 *             allowedDestinations: [TREASURY_ADDRESS],
 *         },
 *         // Custom: full control with a function
 *         [SystemInstruction.CreateAccount]: async (ctx) => {
 *             // Custom validation logic
 *             return true;
 *         },
 *         // Simple allow
 *         [SystemInstruction.AdvanceNonceAccount]: true,
 *         // Explicit deny
 *         [SystemInstruction.UpgradeNonceAccount]: false,
 *     },
 *     required: true, // This program must be present in the transaction
 * });
 * ```
 */
export function createSystemProgramPolicy(config: SystemProgramPolicyConfig): ProgramPolicy {
    return {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        required: config.required,
        async validate(ctx: InstructionPolicyContext): Promise<PolicyResult> {
            // Assert this is a valid System Program instruction with data and accounts
            assertIsInstructionForProgram(ctx.instruction, SYSTEM_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);
            assertIsInstructionWithAccounts(ctx.instruction);

            // After assertions, context is now typed for System Program
            const typedCtx = ctx as SystemProgramPolicyContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifySystemInstruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // 1. Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `System Program: ${SystemInstruction[ixType]} instruction ${reason}`;
            }

            // 2. Allow all: true
            if (ixConfig === true) {
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 3. Custom validator: function
            if (typeof ixConfig === "function") {
                const result = await ixConfig(typedCtx);
                if (result !== true) return result;
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // 4. Declarative config: object
            const validationResult = validateInstruction(ixType, ixConfig, ix);
            if (validationResult !== true) return validationResult;
            return runCustomValidator(config.customValidator, typedCtx);
        },
    };
}

// ============================================================================
// Instruction-specific validation
// ============================================================================

type InstructionConfig =
    | TransferSolConfig
    | CreateAccountConfig
    | AssignConfig
    | AllocateConfig
    | NoConstraintsConfig;

function validateInstruction(
    ixType: SystemInstruction,
    ixConfig: InstructionConfig,
    ix: ValidatedInstruction,
): PolicyResult {
    switch (ixType) {
        case SystemInstruction.TransferSol:
            return validateTransferSol(ixConfig as TransferSolConfig, ix);

        case SystemInstruction.TransferSolWithSeed:
            return validateTransferSolWithSeed(ixConfig as TransferSolConfig, ix);

        case SystemInstruction.CreateAccount:
            return validateCreateAccount(ixConfig as CreateAccountConfig, ix);

        case SystemInstruction.CreateAccountWithSeed:
            return validateCreateAccountWithSeed(ixConfig as CreateAccountConfig, ix);

        case SystemInstruction.Assign:
            return validateAssign(ixConfig as AssignConfig, ix);

        case SystemInstruction.AssignWithSeed:
            return validateAssignWithSeed(ixConfig as AssignConfig, ix);

        case SystemInstruction.Allocate:
            return validateAllocate(ixConfig as AllocateConfig, ix);

        case SystemInstruction.AllocateWithSeed:
            return validateAllocateWithSeed(ixConfig as AllocateConfig, ix);

        // Nonce operations - no additional validation needed
        case SystemInstruction.AdvanceNonceAccount:
        case SystemInstruction.WithdrawNonceAccount:
        case SystemInstruction.InitializeNonceAccount:
        case SystemInstruction.AuthorizeNonceAccount:
        case SystemInstruction.UpgradeNonceAccount:
            return true;

        default:
            return `System Program: Unknown instruction type ${ixType}`;
    }
}

function validateTransferSol(config: TransferSolConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseTransferSolInstruction(ix);

    if (config.maxLamports !== undefined && parsed.data.amount > config.maxLamports) {
        return `System Program: TransferSol amount ${parsed.data.amount} exceeds limit ${config.maxLamports}`;
    }

    if (config.allowedDestinations !== undefined) {
        const dest = parsed.accounts.destination.address;
        if (!config.allowedDestinations.includes(dest)) {
            return `System Program: TransferSol destination ${dest} not in allowlist`;
        }
    }

    return true;
}

function validateTransferSolWithSeed(
    config: TransferSolConfig,
    ix: ValidatedInstruction,
): PolicyResult {
    const parsed = parseTransferSolWithSeedInstruction(ix);

    if (config.maxLamports !== undefined && parsed.data.amount > config.maxLamports) {
        return `System Program: TransferSolWithSeed amount ${parsed.data.amount} exceeds limit ${config.maxLamports}`;
    }

    if (config.allowedDestinations !== undefined) {
        const dest = parsed.accounts.destination.address;
        if (!config.allowedDestinations.includes(dest)) {
            return `System Program: TransferSolWithSeed destination ${dest} not in allowlist`;
        }
    }

    return true;
}

function validateCreateAccount(
    config: CreateAccountConfig,
    ix: ValidatedInstruction,
): PolicyResult {
    const parsed = parseCreateAccountInstruction(ix);

    if (config.maxLamports !== undefined && parsed.data.lamports > config.maxLamports) {
        return `System Program: CreateAccount lamports ${parsed.data.lamports} exceeds limit ${config.maxLamports}`;
    }

    if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
        return `System Program: CreateAccount space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
    }

    if (config.allowedOwnerPrograms !== undefined) {
        const owner = parsed.data.programAddress;
        if (!config.allowedOwnerPrograms.includes(owner)) {
            return `System Program: CreateAccount owner program ${owner} not in allowlist`;
        }
    }

    return true;
}

function validateCreateAccountWithSeed(
    config: CreateAccountConfig,
    ix: ValidatedInstruction,
): PolicyResult {
    const parsed = parseCreateAccountWithSeedInstruction(ix);

    if (config.maxLamports !== undefined && parsed.data.amount > config.maxLamports) {
        return `System Program: CreateAccountWithSeed lamports ${parsed.data.amount} exceeds limit ${config.maxLamports}`;
    }

    if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
        return `System Program: CreateAccountWithSeed space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
    }

    if (config.allowedOwnerPrograms !== undefined) {
        const owner = parsed.data.programAddress;
        if (!config.allowedOwnerPrograms.includes(owner)) {
            return `System Program: CreateAccountWithSeed owner program ${owner} not in allowlist`;
        }
    }

    return true;
}

function validateAssign(config: AssignConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseAssignInstruction(ix);

    if (config.allowedOwnerPrograms !== undefined) {
        const owner = parsed.data.programAddress;
        if (!config.allowedOwnerPrograms.includes(owner)) {
            return `System Program: Assign owner program ${owner} not in allowlist`;
        }
    }

    return true;
}

function validateAssignWithSeed(config: AssignConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseAssignWithSeedInstruction(ix);

    if (config.allowedOwnerPrograms !== undefined) {
        const owner = parsed.data.programAddress;
        if (!config.allowedOwnerPrograms.includes(owner)) {
            return `System Program: AssignWithSeed owner program ${owner} not in allowlist`;
        }
    }

    return true;
}

function validateAllocate(config: AllocateConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseAllocateInstruction(ix);

    if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
        return `System Program: Allocate space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
    }

    return true;
}

function validateAllocateWithSeed(config: AllocateConfig, ix: ValidatedInstruction): PolicyResult {
    const parsed = parseAllocateWithSeedInstruction(ix);

    if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
        return `System Program: AllocateWithSeed space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
    }

    return true;
}
