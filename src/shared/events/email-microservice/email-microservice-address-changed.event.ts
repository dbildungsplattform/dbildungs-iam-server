import { type PersonID } from '../../types/aggregate-ids.types.js';
import { BaseEvent } from '../base-event.js';

export class EmailMicroserviceAddressChangedEvent extends BaseEvent {
    public constructor(
        public readonly personId: PersonID,
        public readonly newPrimaryAddress: string | undefined,
        public readonly newAlternativeAddress: string | undefined,
        public readonly previousPrimaryAddress: string | undefined,
        public readonly previousAlternativeAddress: string | undefined,
    ) {
        super();
    }
}
