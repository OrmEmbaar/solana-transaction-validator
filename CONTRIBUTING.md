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

Comprehensive end-to-end tests that validate real transaction scenarios against a local Solana test validator.

**Prerequisites**:

1. Start the local test validator in a separate terminal:

    ```bash
    ./scripts/start-test-validator.sh
    ```

    The validator runs on `http://localhost:8899`

2. Run integration tests in another terminal:

    ```bash
    pnpm test:integration
    ```

3. Stop the validator when done (Ctrl+C in the validator terminal)
    - The script automatically cleans up the test ledger on exit
    - Uses `flock` to prevent multiple instances

**Note**: Integration tests gracefully skip if the validator is not running.

### Test Structure

```
src/
└── __tests__/          # Unit tests (fast, mocked)
    └── engine.test.ts

test/
├── fixtures/           # Shared test utilities
│   └── test-helpers.ts # Only truly shared utilities (addresses, expectValidationError, etc.)
└── integration/        # Integration tests (require validator)
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

**Malicious Transaction Tests**:

- Unauthorized program attacks (unknown programs, fake token programs, BPF loaders)
- Dangerous instructions on allowed programs (System Program, SPL Token attacks)
- Empty/minimal transactions
- Compute budget manipulation
- Signer role violations
- Custom program discriminator attacks

**Valid Transaction Tests**:

- System Program compliant operations
- SPL Token transfers, approvals, burns within limits
- Compute budget standard configurations
- Multi-instruction transactions
- Signer role compliance
- Custom program allowed patterns

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
