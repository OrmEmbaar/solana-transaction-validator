# solana-tx-policy

Declarative transaction policy validation for Solana remote signers. Define what transactions your keys are allowed to sign using a type-safe, composable policy engine.

## Features

- **Declarative policies** - Define allowed operations with simple configuration objects
- **Program-level validation** - Built-in support for System Program, SPL Token, Token-2022, Compute Budget, and Memo
- **Custom programs** - Easy discriminator-based allowlisting for any program
- **Global constraints** - Signer roles, transaction limits, version validation
- **Simulation validation** - Optional RPC-based constraints (compute units, account closure)
- **Type-safe** - Full TypeScript support with program-specific typing

## Installation

```bash
npm install solana-tx-policy
# or
pnpm add solana-tx-policy
```

**Peer dependencies:** This package requires `@solana/kit` to be installed in your project.

## Quick Start

```typescript
import { address } from "@solana/kit";
import {
    createPolicyValidator,
    createSystemProgramPolicy,
    createComputeBudgetPolicy,
    SignerRole,
    SystemInstruction,
    ComputeBudgetInstruction,
    SYSTEM_PROGRAM_ADDRESS,
    COMPUTE_BUDGET_PROGRAM_ADDRESS,
} from "solana-tx-policy";

// Define your policy
const validator = createPolicyValidator({
    // Global constraints
    global: {
        signerRole: SignerRole.FeePayerOnly, // Signer can only pay fees
        maxInstructions: 10,
        maxSignatures: 3,
    },

    // Program-specific policies
    programs: {
        [SYSTEM_PROGRAM_ADDRESS]: {
            policy: createSystemProgramPolicy({
                instructions: {
                    // Allow transfers up to 1 SOL to specific addresses
                    [SystemInstruction.TransferSol]: {
                        maxLamports: 1_000_000_000n,
                        allowedDestinations: [address("Treasury111111111111111111111111111111111")],
                    },
                    // Explicitly deny account creation
                    [SystemInstruction.CreateAccount]: false,
                },
            }),
        },

        [COMPUTE_BUDGET_PROGRAM_ADDRESS]: {
            policy: createComputeBudgetPolicy({
                instructions: {
                    [ComputeBudgetInstruction.SetComputeUnitLimit]: true,
                    [ComputeBudgetInstruction.SetComputeUnitPrice]: {
                        maxMicroLamports: 100_000n,
                    },
                },
            }),
        },
    },
});

// Validate a transaction
try {
    await validator(compiledTransaction, {
        signer: address("YourSignerPublicKey111111111111111111111"),
        principal: "user@example.com", // Optional: authenticated user
    });
    // Transaction is allowed - proceed with signing
} catch (error) {
    if (error instanceof PolicyValidationError) {
        console.error("Policy denied:", error.message);
    }
}
```

## Core Concepts

### Policy Engine

The `createPolicyValidator` function creates a reusable validator that enforces your policies:

```typescript
const validator = createPolicyValidator({
    global: GlobalPolicyConfig,      // Required: global constraints
    programs?: ProgramConfigs,       // Optional: per-program policies
    simulation?: SimulationConfig,   // Optional: RPC-based validation
});
```

### Global Policies

Global policies apply to the entire transaction:

```typescript
global: {
    // REQUIRED: How can the signer participate?
    signerRole: SignerRole.FeePayerOnly | SignerRole.ParticipantOnly | SignerRole.Any,

    // Optional constraints
    minInstructions?: number,      // Default: 1 (prevents empty transactions)
    maxInstructions?: number,
    minSignatures?: number,
    maxSignatures?: number,
    maxAccounts?: number,          // Total accounts in transaction
    allowedSigners?: Address[],    // Allowlist of valid signers
    allowedVersions?: (0 | "legacy")[],  // Default: [0] (v0 only)
}
```

### Instruction Configuration

Each instruction can be configured as:

| Config Value          | Behavior                                                |
| --------------------- | ------------------------------------------------------- |
| `undefined` (omitted) | Instruction is **denied** (implicit)                    |
| `false`               | Instruction is **denied** (explicit, self-documenting)  |
| `true`                | Instruction is **allowed** with no constraints          |
| `{ ...config }`       | Instruction is **allowed** with declarative constraints |
| `(ctx) => ...`        | Instruction is **allowed** with custom validation logic |

```typescript
instructions: {
    [SystemInstruction.TransferSol]: {
        maxLamports: 1_000_000_000n,
        allowedDestinations: [TREASURY],
    },

    [SystemInstruction.AdvanceNonceAccount]: true,

    [SystemInstruction.CreateAccount]: false,

    [SystemInstruction.Assign]: async (ctx) => {
        // Custom logic - return true to allow, string to deny with reason
        if (someCondition) return true;
        return "Custom validation failed";
    },

    // Omitted instructions are implicitly denied
}
```

### Required Programs

Mark programs or specific instructions as required:

```typescript
programs: {
    [COMPUTE_BUDGET_PROGRAM_ADDRESS]: {
        policy: computeBudgetPolicy,
        required: true,  // Program must be present
    },

    [SYSTEM_PROGRAM_ADDRESS]: {
        policy: systemPolicy,
        required: [SystemInstruction.TransferSol],  // This instruction must be present
    },
}
```

## Built-in Program Policies

### System Program

```typescript
import { createSystemProgramPolicy, SystemInstruction } from "solana-tx-policy";

createSystemProgramPolicy({
    instructions: {
        [SystemInstruction.TransferSol]: {
            maxLamports?: bigint,
            allowedDestinations?: Address[],
        },
        [SystemInstruction.CreateAccount]: {
            maxLamports?: bigint,
            maxSpace?: bigint,
            allowedOwnerPrograms?: Address[],
        },
        // ... other instructions
    },
});
```

### SPL Token & Token-2022

```typescript
import { createSplTokenPolicy, TokenInstruction } from "solana-tx-policy";
import { createToken2022Policy, Token2022Instruction } from "solana-tx-policy";

createSplTokenPolicy({
    instructions: {
        [TokenInstruction.Transfer]: {
            maxAmount?: bigint,
        },
        [TokenInstruction.TransferChecked]: {
            maxAmount?: bigint,
            allowedMints?: Address[],
        },
        [TokenInstruction.Approve]: {
            maxAmount?: bigint,
            allowedMints?: Address[],
            allowedDelegates?: Address[],
        },
        // ... other instructions
    },
});
```

### Compute Budget

```typescript
import { createComputeBudgetPolicy, ComputeBudgetInstruction } from "solana-tx-policy";

createComputeBudgetPolicy({
    instructions: {
        [ComputeBudgetInstruction.SetComputeUnitLimit]: {
            maxUnits?: number,
        },
        [ComputeBudgetInstruction.SetComputeUnitPrice]: {
            maxMicroLamports?: bigint,
        },
        [ComputeBudgetInstruction.RequestHeapFrame]: {
            maxBytes?: number,
        },
    },
});
```

### Memo

```typescript
import { createMemoPolicy } from "solana-tx-policy";

createMemoPolicy({
    instructions: {
        memo: {
            maxLength?: number,
            pattern?: RegExp,
        },
    },
});
```

### Custom Programs

For programs without official `@solana-program/*` packages:

```typescript
import { createCustomProgramPolicy } from "solana-tx-policy";

createCustomProgramPolicy({
    programAddress: address("YourProgram111111111111111111111111111111"),
    allowedInstructions: [
        { discriminator: new Uint8Array([0, 1, 2, 3]), matchMode: "prefix" },
        { discriminator: new Uint8Array([4, 5, 6, 7, 8, 9, 10, 11]), matchMode: "exact" },
    ],
    customValidator: async (ctx) => {
        // Additional validation
        return true;
    },
});
```

## Simulation Validation

Enable RPC-based validation for runtime constraints:

```typescript
import { createSolanaRpc } from "@solana/kit";

const validator = createPolicyValidator({
    global: { signerRole: SignerRole.Any },
    programs: {
        /* ... */
    },
    simulation: {
        rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
        constraints: {
            requireSuccess: true, // Simulation must succeed
            maxComputeUnits: 200_000, // Max CU consumption
            forbidSignerAccountClosure: true, // Prevent signer drain attacks
        },
    },
});
```

**Note:** Simulation requires `transactionMessage` (base64-encoded wire transaction) in the context.

## Error Handling

All validation failures throw `PolicyValidationError`:

```typescript
import { PolicyValidationError } from "solana-tx-policy";

try {
    await validator(transaction, context);
} catch (error) {
    if (error instanceof PolicyValidationError) {
        console.error(error.message);
        // "System Program: TransferSol amount 2000000000 exceeds limit 1000000000"
        // "Instruction 0 uses unauthorized program TokenkegQfe..."
        // "Signer must be the fee payer"
    }
}
```

## TypeScript

The package exports all types for building custom validators:

```typescript
import type {
    PolicyResult,
    GlobalPolicyContext,
    InstructionPolicyContext,
    CustomValidationCallback,
    InstructionPolicy,
    ProgramPolicy,
} from "solana-tx-policy";
```

## License

MIT
