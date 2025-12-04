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
    ParsedTransferSolInstruction,
    ParsedCreateAccountInstruction,
    ParsedAssignInstruction,
    ParsedAllocateInstruction,
    ParsedCreateAccountWithSeedInstruction,
    ParsedAllocateWithSeedInstruction,
    ParsedAssignWithSeedInstruction,
    ParsedTransferSolWithSeedInstruction,
    ParsedWithdrawNonceAccountInstruction,
    ParsedAuthorizeNonceAccountInstruction,
    ParsedInitializeNonceAccountInstruction,
    ParsedAdvanceNonceAccountInstruction,
    ParsedUpgradeNonceAccountInstruction,
} from "@solana-program/system";
import type {
    ValidationContext,
    ValidationResult,
    ProgramValidator,
    InstructionCallback,
} from "../types.js";

// Re-export for convenience
export { SYSTEM_PROGRAM_ADDRESS, SystemInstruction };

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

// ============================================================================
// Typed instruction callbacks
// ============================================================================

/** Callback for TransferSol instruction with typed parsed instruction */
export type TransferSolCallback = InstructionCallback<ParsedTransferSolInstruction>;

/** Callback for TransferSolWithSeed instruction with typed parsed instruction */
export type TransferSolWithSeedCallback = InstructionCallback<ParsedTransferSolWithSeedInstruction>;

/** Callback for CreateAccount instruction with typed parsed instruction */
export type CreateAccountCallback = InstructionCallback<ParsedCreateAccountInstruction>;

/** Callback for CreateAccountWithSeed instruction with typed parsed instruction */
export type CreateAccountWithSeedCallback =
    InstructionCallback<ParsedCreateAccountWithSeedInstruction>;

/** Callback for Assign instruction with typed parsed instruction */
export type AssignCallback = InstructionCallback<ParsedAssignInstruction>;

/** Callback for AssignWithSeed instruction with typed parsed instruction */
export type AssignWithSeedCallback = InstructionCallback<ParsedAssignWithSeedInstruction>;

/** Callback for Allocate instruction with typed parsed instruction */
export type AllocateCallback = InstructionCallback<ParsedAllocateInstruction>;

/** Callback for AllocateWithSeed instruction with typed parsed instruction */
export type AllocateWithSeedCallback = InstructionCallback<ParsedAllocateWithSeedInstruction>;

/** Callback for AdvanceNonceAccount instruction with typed parsed instruction */
export type AdvanceNonceAccountCallback = InstructionCallback<ParsedAdvanceNonceAccountInstruction>;

/** Callback for WithdrawNonceAccount instruction with typed parsed instruction */
export type WithdrawNonceAccountCallback =
    InstructionCallback<ParsedWithdrawNonceAccountInstruction>;

/** Callback for InitializeNonceAccount instruction with typed parsed instruction */
export type InitializeNonceAccountCallback =
    InstructionCallback<ParsedInitializeNonceAccountInstruction>;

/** Callback for AuthorizeNonceAccount instruction with typed parsed instruction */
export type AuthorizeNonceAccountCallback =
    InstructionCallback<ParsedAuthorizeNonceAccountInstruction>;

/** Callback for UpgradeNonceAccount instruction with typed parsed instruction */
export type UpgradeNonceAccountCallback = InstructionCallback<ParsedUpgradeNonceAccountInstruction>;

// ============================================================================
// Main config type
// ============================================================================

/** Config entry for a single instruction: boolean, declarative config, or typed callback */
type InstructionEntry<TConfig, TCallback> = undefined | boolean | TConfig | TCallback;

/**
 * Configuration for the System Program policy.
 *
 * Each instruction type can be:
 * - Omitted: instruction is implicitly DENIED
 * - `false`: instruction is explicitly DENIED (self-documenting)
 * - `true`: instruction is ALLOWED with no constraints
 * - Config object: instruction is ALLOWED with declarative constraints
 * - Function: instruction is ALLOWED with custom validation logic (receives typed parsed instruction)
 */
export interface SystemProgramPolicyConfig {
    /**
     * Per-instruction configuration with typed callbacks.
     */
    instructions: {
        [SystemInstruction.TransferSol]?: InstructionEntry<TransferSolConfig, TransferSolCallback>;
        [SystemInstruction.TransferSolWithSeed]?: InstructionEntry<
            TransferSolConfig,
            TransferSolWithSeedCallback
        >;
        [SystemInstruction.CreateAccount]?: InstructionEntry<
            CreateAccountConfig,
            CreateAccountCallback
        >;
        [SystemInstruction.CreateAccountWithSeed]?: InstructionEntry<
            CreateAccountConfig,
            CreateAccountWithSeedCallback
        >;
        [SystemInstruction.Assign]?: InstructionEntry<AssignConfig, AssignCallback>;
        [SystemInstruction.AssignWithSeed]?: InstructionEntry<AssignConfig, AssignWithSeedCallback>;
        [SystemInstruction.Allocate]?: InstructionEntry<AllocateConfig, AllocateCallback>;
        [SystemInstruction.AllocateWithSeed]?: InstructionEntry<
            AllocateConfig,
            AllocateWithSeedCallback
        >;
        [SystemInstruction.AdvanceNonceAccount]?: InstructionEntry<
            AdvanceNonceAccountConfig,
            AdvanceNonceAccountCallback
        >;
        [SystemInstruction.WithdrawNonceAccount]?: InstructionEntry<
            WithdrawNonceAccountConfig,
            WithdrawNonceAccountCallback
        >;
        [SystemInstruction.InitializeNonceAccount]?: InstructionEntry<
            InitializeNonceAccountConfig,
            InitializeNonceAccountCallback
        >;
        [SystemInstruction.AuthorizeNonceAccount]?: InstructionEntry<
            AuthorizeNonceAccountConfig,
            AuthorizeNonceAccountCallback
        >;
        [SystemInstruction.UpgradeNonceAccount]?: InstructionEntry<
            UpgradeNonceAccountConfig,
            UpgradeNonceAccountCallback
        >;
    };

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
 *         // Custom: full control with a typed callback
 *         [SystemInstruction.CreateAccount]: async (ctx, instruction) => {
 *             // instruction is fully typed as ParsedCreateAccountInstruction
 *             // - instruction.data.lamports (bigint)
 *             // - instruction.data.space (bigint)
 *             // - instruction.accounts.payer.address
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
        async validate(
            ctx: ValidationContext,
            instruction: Instruction,
        ): Promise<ValidationResult> {
            // Assert this is a valid System Program instruction with data and accounts
            assertIsInstructionForProgram(instruction, SYSTEM_PROGRAM_ADDRESS);
            assertIsInstructionWithData(instruction);
            assertIsInstructionWithAccounts(instruction);

            const ix = instruction as ValidatedInstruction;

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
                return true;
            }

            // Look up the handler for this instruction type
            const handler = instructionHandlers[ixType];
            if (!handler) {
                return `System Program: Unknown instruction type ${ixType}`;
            }

            // Get the validator: user-provided callback or our built-in declarative validator
            const validate =
                typeof ixConfig === "function" ? ixConfig : handler.createValidator(ixConfig);

            // Parse and validate
            return await validate(ctx, handler.parse(ix));
        },
    };
}

// ============================================================================
// Instruction handler registry
// ============================================================================

/**
 * Handler for a single instruction type.
 * Pairs the parser with the declarative validator factory.
 *
 * Type safety is maintained at the handler definition level - each handler
 * is created with correctly typed functions. The registry uses `any` because
 * this is inherently a runtime dispatch point where we look up handlers by
 * instruction discriminator.
 */
interface InstructionHandler {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse: (ix: ValidatedInstruction) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createValidator: (config: any) => InstructionCallback<any>;
}

/**
 * Registry of all instruction handlers.
 * Each entry pairs the parser function with the declarative validator factory.
 */
const instructionHandlers: Partial<Record<SystemInstruction, InstructionHandler>> = {
    [SystemInstruction.TransferSol]: {
        parse: parseTransferSolInstruction,
        createValidator: createTransferSolValidator,
    },
    [SystemInstruction.TransferSolWithSeed]: {
        parse: parseTransferSolWithSeedInstruction,
        createValidator: createTransferSolWithSeedValidator,
    },
    [SystemInstruction.CreateAccount]: {
        parse: parseCreateAccountInstruction,
        createValidator: createCreateAccountValidator,
    },
    [SystemInstruction.CreateAccountWithSeed]: {
        parse: parseCreateAccountWithSeedInstruction,
        createValidator: createCreateAccountWithSeedValidator,
    },
    [SystemInstruction.Assign]: {
        parse: parseAssignInstruction,
        createValidator: createAssignValidator,
    },
    [SystemInstruction.AssignWithSeed]: {
        parse: parseAssignWithSeedInstruction,
        createValidator: createAssignWithSeedValidator,
    },
    [SystemInstruction.Allocate]: {
        parse: parseAllocateInstruction,
        createValidator: createAllocateValidator,
    },
    [SystemInstruction.AllocateWithSeed]: {
        parse: parseAllocateWithSeedInstruction,
        createValidator: createAllocateWithSeedValidator,
    },
    [SystemInstruction.AdvanceNonceAccount]: {
        parse: parseAdvanceNonceAccountInstruction,
        createValidator: createAdvanceNonceAccountValidator,
    },
    [SystemInstruction.WithdrawNonceAccount]: {
        parse: parseWithdrawNonceAccountInstruction,
        createValidator: createWithdrawNonceAccountValidator,
    },
    [SystemInstruction.InitializeNonceAccount]: {
        parse: parseInitializeNonceAccountInstruction,
        createValidator: createInitializeNonceAccountValidator,
    },
    [SystemInstruction.AuthorizeNonceAccount]: {
        parse: parseAuthorizeNonceAccountInstruction,
        createValidator: createAuthorizeNonceAccountValidator,
    },
    [SystemInstruction.UpgradeNonceAccount]: {
        parse: parseUpgradeNonceAccountInstruction,
        createValidator: createUpgradeNonceAccountValidator,
    },
};

// --- Transfer validators ---
function createTransferSolValidator(config: TransferSolConfig): TransferSolCallback {
    return (_ctx, parsed) => {
        if (config.maxLamports !== undefined && parsed.data.amount > config.maxLamports) {
            return `System Program: TransferSol amount ${parsed.data.amount} exceeds limit ${config.maxLamports}`;
        }
        if (config.allowedDestinations !== undefined) {
            if (!config.allowedDestinations.includes(parsed.accounts.destination.address)) {
                return `System Program: TransferSol destination ${parsed.accounts.destination.address} not in allowlist`;
            }
        }
        return true;
    };
}

function createTransferSolWithSeedValidator(
    config: TransferSolConfig,
): TransferSolWithSeedCallback {
    return (_ctx, parsed) => {
        if (config.maxLamports !== undefined && parsed.data.amount > config.maxLamports) {
            return `System Program: TransferSolWithSeed amount ${parsed.data.amount} exceeds limit ${config.maxLamports}`;
        }
        if (config.allowedDestinations !== undefined) {
            if (!config.allowedDestinations.includes(parsed.accounts.destination.address)) {
                return `System Program: TransferSolWithSeed destination ${parsed.accounts.destination.address} not in allowlist`;
            }
        }
        return true;
    };
}

// --- CreateAccount validators ---
function createCreateAccountValidator(config: CreateAccountConfig): CreateAccountCallback {
    return (_ctx, parsed) => {
        if (config.maxLamports !== undefined && parsed.data.lamports > config.maxLamports) {
            return `System Program: CreateAccount lamports ${parsed.data.lamports} exceeds limit ${config.maxLamports}`;
        }
        if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
            return `System Program: CreateAccount space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
        }
        if (config.allowedOwnerPrograms !== undefined) {
            if (!config.allowedOwnerPrograms.includes(parsed.data.programAddress)) {
                return `System Program: CreateAccount owner program ${parsed.data.programAddress} not in allowlist`;
            }
        }
        return true;
    };
}

function createCreateAccountWithSeedValidator(
    config: CreateAccountConfig,
): CreateAccountWithSeedCallback {
    return (_ctx, parsed) => {
        if (config.maxLamports !== undefined && parsed.data.amount > config.maxLamports) {
            return `System Program: CreateAccountWithSeed lamports ${parsed.data.amount} exceeds limit ${config.maxLamports}`;
        }
        if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
            return `System Program: CreateAccountWithSeed space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
        }
        if (config.allowedOwnerPrograms !== undefined) {
            if (!config.allowedOwnerPrograms.includes(parsed.data.programAddress)) {
                return `System Program: CreateAccountWithSeed owner program ${parsed.data.programAddress} not in allowlist`;
            }
        }
        return true;
    };
}

// --- Assign validators ---
function createAssignValidator(config: AssignConfig): AssignCallback {
    return (_ctx, parsed) => {
        if (config.allowedOwnerPrograms !== undefined) {
            if (!config.allowedOwnerPrograms.includes(parsed.data.programAddress)) {
                return `System Program: Assign owner program ${parsed.data.programAddress} not in allowlist`;
            }
        }
        return true;
    };
}

function createAssignWithSeedValidator(config: AssignConfig): AssignWithSeedCallback {
    return (_ctx, parsed) => {
        if (config.allowedOwnerPrograms !== undefined) {
            if (!config.allowedOwnerPrograms.includes(parsed.data.programAddress)) {
                return `System Program: AssignWithSeed owner program ${parsed.data.programAddress} not in allowlist`;
            }
        }
        return true;
    };
}

// --- Allocate validators ---
function createAllocateValidator(config: AllocateConfig): AllocateCallback {
    return (_ctx, parsed) => {
        if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
            return `System Program: Allocate space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
        }
        return true;
    };
}

function createAllocateWithSeedValidator(config: AllocateConfig): AllocateWithSeedCallback {
    return (_ctx, parsed) => {
        if (config.maxSpace !== undefined && parsed.data.space > config.maxSpace) {
            return `System Program: AllocateWithSeed space ${parsed.data.space} exceeds limit ${config.maxSpace}`;
        }
        return true;
    };
}

// --- Nonce validators ---
function createAdvanceNonceAccountValidator(
    config: AdvanceNonceAccountConfig,
): AdvanceNonceAccountCallback {
    return (_ctx, parsed) => {
        const nonceCheck = checkAddressAllowed(
            config.allowedNonceAccounts,
            parsed.accounts.nonceAccount.address,
            `System Program: AdvanceNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
        );
        if (nonceCheck !== true) return nonceCheck;
        const authorityCheck = checkAddressAllowed(
            config.allowedAuthorities,
            parsed.accounts.nonceAuthority.address,
            `System Program: AdvanceNonceAccount authority ${parsed.accounts.nonceAuthority.address} not in allowlist`,
        );
        if (authorityCheck !== true) return authorityCheck;
        return true;
    };
}

function createWithdrawNonceAccountValidator(
    config: WithdrawNonceAccountConfig,
): WithdrawNonceAccountCallback {
    return (_ctx, parsed) => {
        const nonceCheck = checkAddressAllowed(
            config.allowedNonceAccounts,
            parsed.accounts.nonceAccount.address,
            `System Program: WithdrawNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
        );
        if (nonceCheck !== true) return nonceCheck;
        const authorityCheck = checkAddressAllowed(
            config.allowedAuthorities,
            parsed.accounts.nonceAuthority.address,
            `System Program: WithdrawNonceAccount authority ${parsed.accounts.nonceAuthority.address} not in allowlist`,
        );
        if (authorityCheck !== true) return authorityCheck;
        const recipientCheck = checkAddressAllowed(
            config.allowedRecipients,
            parsed.accounts.recipientAccount.address,
            `System Program: WithdrawNonceAccount recipient ${parsed.accounts.recipientAccount.address} not in allowlist`,
        );
        if (recipientCheck !== true) return recipientCheck;
        if (config.maxLamports !== undefined && parsed.data.withdrawAmount > config.maxLamports) {
            return `System Program: WithdrawNonceAccount amount ${parsed.data.withdrawAmount} exceeds limit ${config.maxLamports}`;
        }
        return true;
    };
}

function createInitializeNonceAccountValidator(
    config: InitializeNonceAccountConfig,
): InitializeNonceAccountCallback {
    return (_ctx, parsed) => {
        const nonceCheck = checkAddressAllowed(
            config.allowedNonceAccounts,
            parsed.accounts.nonceAccount.address,
            `System Program: InitializeNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
        );
        if (nonceCheck !== true) return nonceCheck;
        const newAuthorityCheck = checkAddressAllowed(
            config.allowedNewAuthorities,
            parsed.data.nonceAuthority,
            `System Program: InitializeNonceAccount authority ${parsed.data.nonceAuthority} not in allowlist`,
        );
        if (newAuthorityCheck !== true) return newAuthorityCheck;
        return true;
    };
}

function createAuthorizeNonceAccountValidator(
    config: AuthorizeNonceAccountConfig,
): AuthorizeNonceAccountCallback {
    return (_ctx, parsed) => {
        const nonceCheck = checkAddressAllowed(
            config.allowedNonceAccounts,
            parsed.accounts.nonceAccount.address,
            `System Program: AuthorizeNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
        );
        if (nonceCheck !== true) return nonceCheck;
        const currentAuthorityCheck = checkAddressAllowed(
            config.allowedCurrentAuthorities,
            parsed.accounts.nonceAuthority.address,
            `System Program: AuthorizeNonceAccount authority ${parsed.accounts.nonceAuthority.address} not in allowlist`,
        );
        if (currentAuthorityCheck !== true) return currentAuthorityCheck;
        const newAuthorityCheck = checkAddressAllowed(
            config.allowedNewAuthorities,
            parsed.data.newNonceAuthority,
            `System Program: AuthorizeNonceAccount new authority ${parsed.data.newNonceAuthority} not in allowlist`,
        );
        if (newAuthorityCheck !== true) return newAuthorityCheck;
        return true;
    };
}

function createUpgradeNonceAccountValidator(
    config: UpgradeNonceAccountConfig,
): UpgradeNonceAccountCallback {
    return (_ctx, parsed) => {
        const nonceCheck = checkAddressAllowed(
            config.allowedNonceAccounts,
            parsed.accounts.nonceAccount.address,
            `System Program: UpgradeNonceAccount nonce account ${parsed.accounts.nonceAccount.address} not in allowlist`,
        );
        if (nonceCheck !== true) return nonceCheck;
        return true;
    };
}

// ============================================================================
// Helpers
// ============================================================================

function checkAddressAllowed(
    allowlist: Address[] | undefined,
    candidate: Address,
    errorMessage: string,
): ValidationResult {
    if (!allowlist || allowlist.length === 0) return true;
    if (allowlist.includes(candidate)) return true;
    return errorMessage;
}
