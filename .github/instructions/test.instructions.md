applyTo: "**/*.{integration-}?spec.ts"

## Testing

- vitest is used for testing
- Tests must be isolated/deterministic and independent from seed data.
- Cover 100% of lines, statements, and branches
- Unit tests mock dependencies; integration tests use real infrastructure where intended.
- Use Arrange, Act, Assert pattern
- One behavior per test
