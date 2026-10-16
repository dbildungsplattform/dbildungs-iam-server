import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { type KafkaEvent } from './kafka-event.js';
import { OrganisationDeletedEvent } from './organisation-deleted.event.js';

export class KafkaOrganisationDeletedEvent extends OrganisationDeletedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.organisationId;
    }

    public static override fromOrganisation(
        organisation: Pick<Organisation<true>, 'id' | 'name' | 'kennung' | 'typ'>,
    ): KafkaOrganisationDeletedEvent {
        return new KafkaOrganisationDeletedEvent(
            organisation.id,
            organisation.name,
            organisation.kennung,
            organisation.typ,
        );
    }
}
