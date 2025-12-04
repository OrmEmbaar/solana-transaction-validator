# solana-transaction-validator

Declarative transaction validation for Solana remote signers. Define exactly what your keys can sign with a type-safe, composable policy engine built for `@solana/kit`.

**Secure by default:** Programs and instructions are denied unless explicitly allowed.

## Installation

```bash
npm install solana-transaction-validator
```

Requires `@solana/kit` as a peer dependency.

## Quick Start

```typescript
import {
    createTransactionValidator,
    createSystemProgramValidator,
    SignerRole,
    SystemInstruction,
} from "solana-transaction-validator";

const validator = createTransactionValidator({
    global: { signerRole: SignerRole.FeePayerOnly },
    programs: [
        createSystemProgramValidator({
            instructions: {
                [SystemInstruction.TransferSol]: { maxLamports: 1_000_000_000n },
            },
        }),
    ],
});

await validator(wireTransaction, signerAddress); // throws ValidationError on failure
```

## Instruction Configuration

Each instruction can be configured in five ways:

| Config                 | Behavior                               |
| ---------------------- | -------------------------------------- |
| `undefined` (omitted)  | Denied (implicit)                      |
| `false`                | Denied (explicit, self-documenting)    |
| `true`                 | Allowed with no constraints            |
| `{ ...config }`        | Allowed with declarative constraints   |
| `(ctx, parsed) => ...` | Allowed with custom validation (typed) |

```typescript
instructions: {
    [SystemInstruction.TransferSol]: { maxLamports: 1_000_000_000n },  // constrained
    [SystemInstruction.AdvanceNonceAccount]: true,                     // allowed
    [SystemInstruction.CreateAccount]: false,                          // denied (explicit)
    [SystemInstruction.Assign]: async (ctx, parsed) => {               // custom logic
        // parsed is fully typed (ParsedAssignInstruction)
        return isAllowed ? true : "Denied: reason";
    },
    // omitted instructions are denied
}
```

## Built-in Validators

| Validator                      | Program        |
| ------------------------------ | -------------- |
| `createSystemProgramValidator` | System Program |
| `createSplTokenValidator`      | SPL Token      |
| `createToken2022Validator`     | Token-2022     |
| `createComputeBudgetValidator` | Compute Budget |
| `createMemoValidator`          | Memo           |

Each exports an instruction enum (e.g., `SystemInstruction`) and typed config interfaces.

## Custom Programs

For programs without `@solana-program/*` packages, use discriminator-based allowlisting:

```typescript
createCustomProgramValidator({
    programAddress: address("MyProgram111111111111111111111111111111111"),
    instructions: [
        { discriminator: new Uint8Array([0x9a, 0x5c, 0x1b, 0x3d, 0x8f, 0x2e, 0x7a, 0x4c]) }, // 8-byte Anchor
        { discriminator: new Uint8Array([1]) }, // 1-byte native
        {
            discriminator: new Uint8Array([2]),
            validate: (ctx, ix) => {
                /* custom logic */ return true;
            },
        },
    ],
});
```

Discriminator length determines how many bytes are matched (prefix match).

## Global Policy

```typescript
global: {
    signerRole: SignerRole.FeePayerOnly,  // Required: FeePayerOnly | ParticipantOnly | Any
    maxInstructions: 10,                   // Optional: limit instruction count
    allowedVersions: [0],                  // Default: [0] (v0 transactions only)
    addressLookupTables: false,            // Default: false (deny ALTs)
}
```

## Required Programs

Enforce that specific programs or instructions must be present:

```typescript
createComputeBudgetValidator({
    instructions: { /* ... */ },
    required: true,  // or: required: [ComputeBudgetInstruction.SetComputeUnitPrice]
}),
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
