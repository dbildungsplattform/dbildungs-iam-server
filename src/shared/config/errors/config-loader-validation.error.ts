import { ValidationError } from 'class-validator';
import { DomainError } from '../../error/domain.error.js';

export class ConfigLoaderValidationError extends DomainError {
    public constructor(errors: ValidationError[], details?: unknown[] | Record<string, undefined>) {
        const message: string = errors
            .map((error: ValidationError) => error.toString())
            .reduce((previous: string, current: string) => `${previous}\n${current}`, '');
        super(message, 'CONFIG_LOADER_VALIDATION_ERROR', details);
    }
}
