import { Organisation } from '../../modules/organisation/domain/organisation.js';
import { KafkaEvent } from './kafka-event.js';
import { SchuleUpdatedEvent } from './schule-updated.event.js';

export class KafkaSchuleUpdatedEvent extends SchuleUpdatedEvent implements KafkaEvent {
    public get kafkaKey(): string {
        return this.organisationId;
    }

    public static override fromOrganisations(
        newOrganisation: Organisation<true>,
        oldOrganisation: Organisation<true>,
    ): KafkaSchuleUpdatedEvent {
        return new KafkaSchuleUpdatedEvent(
            newOrganisation.id,
            newOrganisation.kennung,
            newOrganisation.name,
            newOrganisation.itslearningEnabled,
            newOrganisation.administriertVon,
            newOrganisation.zugehoerigZu,
            oldOrganisation.kennung,
            oldOrganisation.name,
            oldOrganisation.administriertVon,
            oldOrganisation.zugehoerigZu,
        );
    }
}
