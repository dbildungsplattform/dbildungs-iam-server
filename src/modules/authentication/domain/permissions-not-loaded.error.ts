import { DomainError } from "../../../shared/error/domain.error.js";

export class PermissionsNotLoadedError extends DomainError {
    public constructor(details?: unknown[] | Record<string, undefined>) {
        super('Permissions not loaded',  'PERMISSIONS_NOT_LOADED', details);
    }
}
