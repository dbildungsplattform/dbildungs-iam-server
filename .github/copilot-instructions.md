# Project Guidelines

## Architecture

- Keep business logic in aggregates/domain services, not controllers.
- Controllers map DTOs and do minimal orchestration.
- Use domain services for cross-aggregate/repository orchestration.
- Repositories expose domain-facing contracts only (no ORM/entity leakage).
- Export only required providers; keep bypass-prone repositories internal.

## Authorization and Integrity

- Enforce permissions in domain services/repositories, not in controllers.
- Public methods in exported components must enforce required permissions.
- If multiple repositories are called, centralize permission checks in the domain service.
- Run integrity/specification checks before persistence.

## Errors

- In domain logic, prefer `Result<T, E>` over thrown exceptions.
- Use explicit `DomainError` types and map them at API boundaries with exception filters.
- Follow the existing validation/error filter strategy; flag bypasses.
