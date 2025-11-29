// ============================================================================
// Types
// ============================================================================

export type {
    BasePolicyContext,
    GlobalPolicyContext,
    InstructionPolicyContext,
    PolicyResult,
    GlobalPolicyConfig,
    SimulationConstraints,
    GlobalPolicy,
    InstructionPolicy,
    ProgramPolicy,
} from "./types.js";

export { SignerRole } from "./types.js";

// ============================================================================
// Errors
// ============================================================================

export {
    SignerErrorCode,
    RemoteSignerError,
    type SignerErrorBody,
} from "./errors.js";

// ============================================================================
// Engine
// ============================================================================

export {
    createPolicyValidator,
    type PolicyEngineConfig,
    type TransactionValidator,
} from "./engine.js";

// ============================================================================
// Global Policies
// ============================================================================

export { validateGlobalPolicy } from "./global/validator.js";
export { validateSignerRole } from "./global/signer-role.js";
export { validateTransactionLimits } from "./global/transaction-limits.js";

// ============================================================================
// Program Policies
// ============================================================================

// Utilities
export {
    arraysEqual,
    hasPrefix,
    composeValidators,
    runCustomValidator,
    type CustomValidationCallback,
} from "./programs/utils.js";

// Custom Program (for programs without @solana-program/* packages)
export {
    createCustomProgramPolicy,
    type CustomProgramPolicyConfig,
    type DiscriminatorRule,
} from "./programs/custom-program.js";

// System Program
export {
    createSystemProgramPolicy,
    SYSTEM_PROGRAM_ADDRESS,
    SystemInstruction,
    type SystemProgramPolicyConfig,
    type SystemInstructionConfigs,
    type TransferSolConfig,
    type CreateAccountConfig,
    type AssignConfig,
    type AllocateConfig,
} from "./programs/system-program.js";

// SPL Token
export {
    createSplTokenPolicy,
    TOKEN_PROGRAM_ADDRESS,
    TokenInstruction,
    type SplTokenPolicyConfig,
    type TokenInstructionConfigs,
    type TransferConfig as SplTokenTransferConfig,
    type ApproveConfig as SplTokenApproveConfig,
    type MintToConfig as SplTokenMintToConfig,
    type BurnConfig as SplTokenBurnConfig,
    type SetAuthorityConfig as SplTokenSetAuthorityConfig,
} from "./programs/spl-token.js";

// Token-2022
export {
    createToken2022Policy,
    TOKEN_2022_PROGRAM_ADDRESS,
    Token2022Instruction,
    type Token2022PolicyConfig,
    type TransferConfig as Token2022TransferConfig,
    type ApproveConfig as Token2022ApproveConfig,
    type MintToConfig as Token2022MintToConfig,
    type BurnConfig as Token2022BurnConfig,
    type SetAuthorityConfig as Token2022SetAuthorityConfig,
} from "./programs/token-2022.js";

// Compute Budget
export {
    createComputeBudgetPolicy,
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
    ComputeBudgetInstruction,
    type ComputeBudgetPolicyConfig,
    type ComputeBudgetInstructionConfigs,
    type SetComputeUnitLimitConfig,
    type SetComputeUnitPriceConfig,
    type RequestHeapFrameConfig,
} from "./programs/compute-budget.js";

// Memo
export {
    createMemoPolicy,
    MEMO_PROGRAM_ADDRESS,
    type MemoPolicyConfig,
    type MemoConfig,
} from "./programs/memo.js";

// ============================================================================
// Simulation (stub)
// ============================================================================

export {
    validateSimulation,
    type SimulationConstraints as SimulationValidatorConstraints,
} from "./simulation/validator.js";

