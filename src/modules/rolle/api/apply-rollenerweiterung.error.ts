import { DomainError } from '../../../shared/error/index.js';
import { MultiDomainError } from '../../../shared/error/multidomain.error.js';
import { ErrorIdType } from './ErrorIdType.enum.js';

export type ApplyRollenerweiterungErrorEntry = {
    id: string;
    errorIdType: ErrorIdType;
    error: DomainError;
};

export class ApplyRollenerweiterungError extends MultiDomainError {
    public readonly rollenerweiterungErrors: ApplyRollenerweiterungErrorEntry[];

    public constructor(errors: ApplyRollenerweiterungErrorEntry[]) {
        super(
            errors.map((e: { id: string; error: DomainError }) => ({ id: e.id, error: e.error })),
            `${errors.length} errors occured while applying rollenerweiterungen`,
        );

        this.rollenerweiterungErrors = errors;
    }
}
