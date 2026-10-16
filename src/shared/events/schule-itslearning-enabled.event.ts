import { type OrganisationsTyp } from '../../modules/organisation/domain/organisation.enums.js';
import { type OrganisationID } from '../types/index.js';
import { BaseEvent } from './base-event.js';

export class SchuleItslearningEnabledEvent extends BaseEvent {
    public constructor(
        public readonly organisationId: OrganisationID,
        public readonly typ: OrganisationsTyp,
        public readonly kennung: string | undefined,
        public readonly name: string | undefined,
    ) {
        super();
    }
}
