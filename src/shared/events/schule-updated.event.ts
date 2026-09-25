import { BaseEvent } from './base-event.js';
import { OrganisationID } from '../types/index.js';

export class SchuleUpdatedEvent extends BaseEvent {
    public constructor(
        public readonly organisationId: OrganisationID,
        public readonly oldName: string | undefined,
        public readonly newName: string | undefined,
        public readonly oldKennung: string | undefined,
        public readonly newKennung: string | undefined,
    ) {
        super();
    }
}