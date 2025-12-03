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
    parseWithdrawNonceAccountInstruction,
    parseAuthorizeNonceAccountInstruction,
    parseInitializeNonceAccountInstruction,
    parseAdvanceNonceAccountInstruction,
    parseUpgradeNonceAccountInstruction,
} from "@solana-program/system";
import type {
    InstructionValidationContext,
    ValidationResult,
    ProgramValidator,
    ProgramPolicyConfig,
} from "../types.js";
import { runCustomValidator } from "./utils.js";

// Re-export for convenience
export { SYSTEM_PROGRAM_ADDRESS, SystemInstruction };

// Program-specific context type
export type SystemProgramValidationContext = InstructionValidationContext<
    typeof SYSTEM_PROGRAM_ADDRESS
>;

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

/** Base config for nonce-account touching instructions */
export interface NonceAccountConfig {
    /** Allowlist of nonce accounts that can be targeted */
    allowedNonceAccounts?: Address[];
}

/** Config for nonce instructions that require an authority signer */
export interface NonceAccountAuthorityConfig extends NonceAccountConfig {
    /** Allowlist of nonce authorities permitted to sign */
    allowedAuthorities?: Address[];
}

/** Config for WithdrawNonceAccount instruction */
export interface WithdrawNonceAccountConfig extends NonceAccountAuthorityConfig {
    /** Maximum lamports that can be withdrawn */
    maxLamports?: bigint;
    /** Allowlist of withdrawal destinations */
    allowedRecipients?: Address[];
}

/** Config for AuthorizeNonceAccount instruction */
export interface AuthorizeNonceAccountConfig extends NonceAccountConfig {
    /** Allowlist of current authorities permitted to make the change */
    allowedCurrentAuthorities?: Address[];
    /** Allowlist of new authorities that can be assigned */
    allowedNewAuthorities?: Address[];
}

/** Config for InitializeNonceAccount instruction */
export interface InitializeNonceAccountConfig extends NonceAccountConfig {
    /** Allowlist of nonce authorities that can be configured */
    allowedNewAuthorities?: Address[];
}

/** Config for AdvanceNonceAccount instruction */
export type AdvanceNonceAccountConfig = NonceAccountAuthorityConfig;

/** Config for UpgradeNonceAccount instruction */
export type UpgradeNonceAccountConfig = NonceAccountConfig;

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
    // Nonce operations
    [SystemInstruction.AdvanceNonceAccount]: AdvanceNonceAccountConfig;
    [SystemInstruction.WithdrawNonceAccount]: WithdrawNonceAccountConfig;
    [SystemInstruction.InitializeNonceAccount]: InitializeNonceAccountConfig;
    [SystemInstruction.AuthorizeNonceAccount]: AuthorizeNonceAccountConfig;
    [SystemInstruction.UpgradeNonceAccount]: UpgradeNonceAccountConfig;
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
 * @returns A ProgramValidator that validates System Program instructions
 *
 * @example
 * ```typescript
 * const systemPolicy = createSystemProgramValidator({
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
export function createSystemProgramValidator(config: SystemProgramPolicyConfig): ProgramValidator {
    return {
        programAddress: SYSTEM_PROGRAM_ADDRESS,
        required: config.required,
        async validate(ctx: InstructionValidationContext): Promise<ValidationResult> {
            // Assert this is a valid System Program instruction with data and accounts
            assertIsInstructionForProgram(ctx.instruction, SYSTEM_PROGRAM_ADDRESS);
            assertIsInstructionWithData(ctx.instruction);
            assertIsInstructionWithAccounts(ctx.instruction);

            // After assertions, context is now typed for System Program
            const typedCtx = ctx as SystemProgramValidationContext;
            const ix = typedCtx.instruction as ValidatedInstruction;

            // Identify the instruction type
            const ixType = identifySystemInstruction(ix.data);
            const ixConfig = config.instructions[ixType];

            // Deny: undefined or false
            if (ixConfig === undefined || ixConfig === false) {
                const reason = ixConfig === false ? "explicitly denied" : "not allowed";
                return `System Program: ${SystemInstruction[ixType]} instruction ${reason}`;
            }

            // Allow all: true
            if (ixConfig === true) {
                return runCustomValidator(config.customValidator, typedCtx);
            }

            // Validate: function or declarative config
            let result: ValidationResult;
            if (typeof ixConfig === "function") {
                result = await ixConfig(typedCtx);
            } else {
                result = validateInstruction(ixType, ixConfig, ix);
            }

            if (result !== true) return result;
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
    | AdvanceNonceAccountConfig
    | WithdrawNonceAccountConfig
    | InitializeNonceAccountConfig
    | AuthorizeNonceAccountConfig
    | UpgradeNonceAccountConfig
    | NoConstraintsConfig;

function validateInstruction(
    ixType: SystemInstruction,
    ixConfig: InstructionConfig,
    ix: ValidatedInstruction,
): ValidationResult {
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

        case SystemInstruction.AdvanceNonceAccount:
            return validateAdvanceNonceAccount(ixConfig as AdvanceNonceAccountConfig, ix);

        case SystemInstruction.WithdrawNonceAccount:
            return validateWithdrawNonceAccount(ixConfig as WithdrawNonceAccountConfig, ix);

        case SystemInstruction.InitializeNonceAccount:
            return validateInitializeNonceAccount(ixConfig as InitializeNonceAccountConfig, ix);

        case SystemInstruction.AuthorizeNonceAccount:
            return validateAuthorizeNonceAccount(ixConfig as AuthorizeNonceAccountConfig, ix);

        case SystemInstruction.UpgradeNonceAccount:
            return validateUpgradeNonceAccount(ixConfig as UpgradeNonceAccountConfig, ix);

        default:
            return `System Program: Unknown instruction type ${ixType}`;
    }
}

function validateTransferSol(
    config: TransferSolConfig,
    ix: ValidatedInstruction,
): ValidationResult {
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
): ValidationResult {
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
): ValidationResult {
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
): ValidationResult {
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

function validateAssign(config: AssignConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseAssignInstruction(ix);

    if (config.allowedOwnerPrograms !== undefined) {
        const owner = parsed.data.programAddress;
        if (!config.allowedOwnerPrograms.includes(owner)) {
            return `System Program: Assign owner program ${owner} not in allowlist`;
        }
    }

    return true;
}

function validateAssignWithSeed(config: AssignConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseAssignWithSeedInstruction(ix);

    if (config.allowedOwnerPrograms !== undefined) {
        const owner = parsed.data.programAddress;
        if (!config.allowedOwnerPrograms.includes(owner)) {
            return `System Program: AssignWithSeed owner program ${owner} not in allowlist`;
        }
    }

    return true;
}

function validateAllocate(config: AllocateConfig, ix: ValidatedInstruction): ValidationResult {
    const parsed = parseAllocateInstruction(ix);

    if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
        return `System Program: Allocate space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
    }

    return true;
}

function validateAllocateWithSeed(
    config: AllocateConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseAllocateWithSeedInstruction(ix);

    if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
        return `System Program: AllocateWithSeed space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
    }

    return true;
}

function validateAdvanceNonceAccount(
    config: AdvanceNonceAccountConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseAdvanceNonceAccountInstruction(ix);
    const nonceCheck = ensureAddressAllowed(
        config.allowedNonceAccounts,
        parsed.accounts.nonceAccount.address,
        `System Program: AdvanceNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
    );
    if (nonceCheck !== true) return nonceCheck;

    const authorityCheck = ensureAddressAllowed(
        config.allowedAuthorities,
        parsed.accounts.nonceAuthority.address,
        `System Program: AdvanceNonceAccount authority ${parsed.accounts.nonceAuthority.address} not in allowlist`,
    );
    if (authorityCheck !== true) return authorityCheck;

    return true;
}

function validateWithdrawNonceAccount(
    config: WithdrawNonceAccountConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseWithdrawNonceAccountInstruction(ix);

    const nonceCheck = ensureAddressAllowed(
        config.allowedNonceAccounts,
        parsed.accounts.nonceAccount.address,
        `System Program: WithdrawNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
    );
    if (nonceCheck !== true) return nonceCheck;

    const authorityCheck = ensureAddressAllowed(
        config.allowedAuthorities,
        parsed.accounts.nonceAuthority.address,
        `System Program: WithdrawNonceAccount authority ${parsed.accounts.nonceAuthority.address} not in allowlist`,
    );
    if (authorityCheck !== true) return authorityCheck;

    const recipientCheck = ensureAddressAllowed(
        config.allowedRecipients,
        parsed.accounts.recipientAccount.address,
        `System Program: WithdrawNonceAccount recipient ${parsed.accounts.recipientAccount.address} not in allowlist`,
    );
    if (recipientCheck !== true) return recipientCheck;

    if (config.maxLamports !== undefined && parsed.data.withdrawAmount > config.maxLamports) {
        return `System Program: WithdrawNonceAccount amount ${parsed.data.withdrawAmount} exceeds limit ${config.maxLamports}`;
    }

    return true;
}

function validateInitializeNonceAccount(
    config: InitializeNonceAccountConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseInitializeNonceAccountInstruction(ix);

    const nonceCheck = ensureAddressAllowed(
        config.allowedNonceAccounts,
        parsed.accounts.nonceAccount.address,
        `System Program: InitializeNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
    );
    if (nonceCheck !== true) return nonceCheck;

    const newAuthorityCheck = ensureAddressAllowed(
        config.allowedNewAuthorities,
        parsed.data.nonceAuthority,
        `System Program: InitializeNonceAccount authority ${parsed.data.nonceAuthority} not in allowlist`,
    );
    if (newAuthorityCheck !== true) return newAuthorityCheck;

    return true;
}

function validateAuthorizeNonceAccount(
    config: AuthorizeNonceAccountConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseAuthorizeNonceAccountInstruction(ix);

    const nonceCheck = ensureAddressAllowed(
        config.allowedNonceAccounts,
        parsed.accounts.nonceAccount.address,
        `System Program: AuthorizeNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
    );
    if (nonceCheck !== true) return nonceCheck;

    const currentAuthorityCheck = ensureAddressAllowed(
        config.allowedCurrentAuthorities,
        parsed.accounts.nonceAuthority.address,
        `System Program: AuthorizeNonceAccount authority ${parsed.accounts.nonceAuthority.address} not in allowlist`,
    );
    if (currentAuthorityCheck !== true) return currentAuthorityCheck;

    const newAuthorityCheck = ensureAddressAllowed(
        config.allowedNewAuthorities,
        parsed.data.newNonceAuthority,
        `System Program: AuthorizeNonceAccount new authority ${parsed.data.newNonceAuthority} not in allowlist`,
    );
    if (newAuthorityCheck !== true) return newAuthorityCheck;

    return true;
}

function validateUpgradeNonceAccount(
    config: UpgradeNonceAccountConfig,
    ix: ValidatedInstruction,
): ValidationResult {
    const parsed = parseUpgradeNonceAccountInstruction(ix);

    const nonceCheck = ensureAddressAllowed(
        config.allowedNonceAccounts,
        parsed.accounts.nonceAccount.address,
        `System Program: UpgradeNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
    );
    if (nonceCheck !== true) return nonceCheck;

    return true;
}

function ensureAddressAllowed(
    allowlist: Address[] | undefined,
    candidate: Address,
    errorMessage: string,
): ValidationResult {
    if (!allowlist || allowlist.length === 0) {
        return true;
    }
    if (allowlist.includes(candidate)) {
        return true;
    }
    return errorMessage;
}
