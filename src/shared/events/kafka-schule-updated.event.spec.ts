import { DoFactory } from '../../../test/utils/do-factory.js';
import { Organisation } from '../../modules/organisation/domain/organisation.js';
import { KafkaSchuleUpdatedEvent } from './kafka-schule-updated.event.js';

describe('KafkaSchuleUpdatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const organisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);
        organisation.itslearningEnabled = true;

        const event: KafkaSchuleUpdatedEvent = KafkaSchuleUpdatedEvent.fromOrganisations(organisation, organisation);

        expect(event).toBeInstanceOf(KafkaSchuleUpdatedEvent);
        expect(event.kafkaKey).toBe(organisation.id);
        expect(event.itslearningEnabled).toBe(true);
    });
});
