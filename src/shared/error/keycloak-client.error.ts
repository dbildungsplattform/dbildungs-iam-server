import { SharedDomainError } from './shared-domain.error.js';

export class KeycloakClientError extends SharedDomainError {
    public constructor(message: string, details?: unknown[] | Record<string, unknown>) {
        super(message, 'KEYCLOAK_CLIENT_ERROR', details);
    }
}
