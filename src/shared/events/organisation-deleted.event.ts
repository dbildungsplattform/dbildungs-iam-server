import { type OrganisationsTyp } from '../../modules/organisation/domain/organisation.enums.js';
import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { type OrganisationID } from '../types/index.js';
import { BaseEvent } from './base-event.js';

export class OrganisationDeletedEvent extends BaseEvent {
    public constructor(
        public readonly organisationId: OrganisationID,
        public readonly name?: string,
        public readonly kennung?: string,
        public readonly typ?: OrganisationsTyp,
    ) {
        super();
    }

    public static fromOrganisation(
        organisation: Pick<Organisation<true>, 'id' | 'name' | 'kennung' | 'typ'>,
    ): OrganisationDeletedEvent {
        return new OrganisationDeletedEvent(organisation.id, organisation.name, organisation.kennung, organisation.typ);
    }
}
