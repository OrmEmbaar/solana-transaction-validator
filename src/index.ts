// ============================================================================
// Types
// ============================================================================

export type {
    BaseValidationContext,
    GlobalValidationContext,
    InstructionValidationContext,
    ValidationResult,
    CustomValidationCallback,
    InstructionConfigEntry,
    GlobalPolicyConfig,
    GlobalValidator,
    InstructionValidator,
    ProgramValidator,
    ProgramPolicyConfig,
    SimulationConstraints,
} from "./types.js";

export { SignerRole } from "./types.js";

// ============================================================================
// Errors
// ============================================================================

export { ValidationError } from "./errors.js";

// ============================================================================
// Engine
// ============================================================================

export {
    createTransactionValidator,
    type TransactionValidatorConfig,
    type SimulationConfig,
    type TransactionValidator,
} from "./engine.js";

// ============================================================================
// Global Policies
// ============================================================================

export { validateGlobalPolicy } from "./global/validator.js";
export { validateSignerRole } from "./global/signer-role.js";
export {
    validateTransactionLimits,
    type TransactionLimitsConfig,
} from "./global/transaction-limits.js";
export { validateSignerAllowlist } from "./global/signer-allowlist.js";
export { validateTransactionVersion } from "./global/version-validation.js";
export {
    validateAddressLookups,
    type AddressLookupConfig,
} from "./global/address-lookup-validation.js";
export type { TransactionVersion } from "@solana/kit";

// ============================================================================
// Program Policies
// ============================================================================

// Utilities
export { arraysEqual, hasPrefix, composeValidators, runCustomValidator } from "./programs/utils.js";

// Custom Program (for programs without @solana-program/* packages)
export {
    createCustomProgramValidator,
    type CustomProgramPolicyConfig,
    type DiscriminatorRule,
} from "./programs/custom-program.js";

// System Program
export {
    createSystemProgramValidator,
    SYSTEM_PROGRAM_ADDRESS,
    SystemInstruction,
    type SystemProgramPolicyConfig,
    type SystemProgramValidationContext,
    type SystemInstructionConfigs,
    type TransferSolConfig,
    type CreateAccountConfig,
    type AssignConfig,
    type AllocateConfig,
    type AdvanceNonceAccountConfig,
    type WithdrawNonceAccountConfig,
    type InitializeNonceAccountConfig,
    type AuthorizeNonceAccountConfig,
    type UpgradeNonceAccountConfig,
} from "./programs/system-program.js";

// SPL Token
export {
    createSplTokenValidator,
    TOKEN_PROGRAM_ADDRESS,
    TokenInstruction,
    type SplTokenPolicyConfig,
    type SplTokenValidationContext,
    type TokenInstructionConfigs,
    type TransferConfig as SplTokenTransferConfig,
    type ApproveConfig as SplTokenApproveConfig,
    type MintToConfig as SplTokenMintToConfig,
    type BurnConfig as SplTokenBurnConfig,
    type SetAuthorityConfig as SplTokenSetAuthorityConfig,
    type CloseAccountConfig as SplTokenCloseAccountConfig,
    type FreezeThawConfig as SplTokenFreezeThawConfig,
    type RevokeSimpleConfig as SplTokenRevokeConfig,
} from "./programs/spl-token.js";

// Token-2022
export {
    createToken2022Validator,
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    type Token2022PolicyConfig,
    type Token2022ValidationContext,
    type TransferConfig as Token2022TransferConfig,
    type ApproveConfig as Token2022ApproveConfig,
    type MintToConfig as Token2022MintToConfig,
    type BurnConfig as Token2022BurnConfig,
    type SetAuthorityConfig as Token2022SetAuthorityConfig,
    type CloseAccountConfig as Token2022CloseAccountConfig,
    type FreezeThawConfig as Token2022FreezeThawConfig,
    type RevokeSimpleConfig as Token2022RevokeConfig,
} from "./programs/token-2022.js";

// Compute Budget
export {
    createComputeBudgetValidator,
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
    ComputeBudgetInstruction,
    type ComputeBudgetPolicyConfig,
    type ComputeBudgetValidationContext,
    type ComputeBudgetInstructionConfigs,
    type SetComputeUnitLimitConfig,
    type SetComputeUnitPriceConfig,
    type RequestHeapFrameConfig,
    type SetLoadedAccountsDataSizeLimitConfig,
} from "./programs/compute-budget.js";

// Memo
export {
    createMemoValidator,
    MEMO_PROGRAM_ADDRESS,
    MemoInstruction,
    type MemoPolicyConfig,
    type MemoValidationContext,
    type MemoInstructionConfigs,
    type MemoConfig,
} from "./programs/memo.js";

// ============================================================================
// Simulation
// ============================================================================

export { validateSimulation } from "./simulation/validator.js";
