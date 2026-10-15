import { BaseEvent } from './base-event.js';
import { type OrganisationID } from '../types/index.js';
import { type RootDirectChildrenType } from '../../modules/organisation/domain/organisation.enums.js';

export class SchuleCreatedEvent extends BaseEvent {
    public constructor(
        public readonly organisationId: OrganisationID,
        public readonly kennung: string | undefined,
        public readonly name: string | undefined,
        public readonly rootDirectChildrenZuordnung: RootDirectChildrenType,
    ) {
        super();
    }
}
