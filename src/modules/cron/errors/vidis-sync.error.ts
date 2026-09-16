import { DomainError } from '../../../shared/error/domain.error.js';

export class VidisSyncTriggerError extends DomainError {
    public constructor(details?: unknown[] | Record<string, unknown>) {
        super(
            'Failed to trigger VIDIS sync due to an internal server error.',
            'CRON_VIDIS_SYNC_TRIGGER_ERROR',
            details,
        );
    }
}
