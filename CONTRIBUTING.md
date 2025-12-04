# Contributing Guide

## Development Setup

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check
pnpm check-types

# Lint
pnpm lint

# Format
pnpm format
```

## Testing Strategy

### Unit Tests (`src/__tests__/`)

Fast, isolated tests with no external dependencies. Test individual components and engine logic.

- Use mocked validators
- Focus on engine orchestration
- Test validation logic in isolation
- No network calls or external services

**Location**: `src/__tests__/`

**Run**: `pnpm test`

### Integration Tests (`test/integration/`)

Comprehensive end-to-end tests that validate real transaction scenarios against the policy engine.

```bash
# Run integration tests
pnpm test:integration

# Run all tests (unit + integration)
pnpm test:all
```

**Note**: All integration tests are policy-based and do not require a running validator.

### Test Structure

```
src/
└── __tests__/          # Unit tests (fast, mocked)
    └── engine.test.ts

test/
├── fixtures/           # Shared test utilities
│   └── test-helpers.ts # Addresses, expectValidationError, toWireTransaction, etc.
└── integration/        # Integration tests (policy validation)
    ├── malicious-transactions.test.ts  # Attack scenarios
    └── valid-transactions.test.ts      # Happy path scenarios
```

### Writing Integration Tests

**Keep it simple**: Inline transaction building rather than abstracting into helpers. The `@solana/kit` type system works best with inline code and type inference.

**Good** (inline pattern):

```typescript
const blockhash = await getRecentBlockhash();
const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstruction(someInstruction, tx),
    (tx) => setTransactionMessageFeePayer(SIGNER_ADDRESS, tx),
    compileTransactionMessage,
);
```

**Avoid** (over-abstraction):

```typescript
// Don't create helpers that fight the type system
const tx = pipe(
    createTxBuilder(blockhash), // Complex type gymnastics
    (tx) => finalizeAndCompile(tx), // More type fighting
);
```

### Test Coverage

**Unit Tests:**

- Transaction validator engine orchestration
- Program allowlist enforcement
- Required programs/instructions validation

**Integration Tests - Malicious Scenarios:**

- **Unauthorized Program Attacks** - Unknown programs, malicious token programs, BPF loaders
- **Dangerous Instructions** - System Program attacks (assign, create account, transfer limits)
- **Token Attacks** - SPL Token authority changes, excessive approvals, account closures
- **Empty Transactions** - Zero instructions, compute-budget-only transactions
- **Compute Budget Manipulation** - Excessive CUs, priority fees, heap frames
- **Signer Role Violations** - FeePayerOnly, ParticipantOnly constraints
- **Custom Program Discriminators** - Unknown/wrong discriminators

**Integration Tests - Valid Scenarios:**

- **System Program** - Compliant transfers, account creation, allocations
- **SPL Token** - Transfers, approvals, burns within limits
- **Compute Budget** - Standard priority fees and CU settings
- **Multi-instruction** - Complex transactions with multiple programs
- **Signer Roles** - Correct fee payer and participant configurations
- **Custom Programs** - Allowed discriminator patterns

## Code Style

- Use Prettier for formatting (automatically enforced)
- Follow ESLint rules (run `pnpm lint`)
- Write descriptive test names that explain the scenario

## Pull Request Process

1. Ensure all tests pass (`pnpm test:all`)
2. Run type check (`pnpm check-types`)
3. Lint your code (`pnpm lint`)
4. Format your code (`pnpm format`)
5. Write clear commit messages
6. Update README.md if adding new features
