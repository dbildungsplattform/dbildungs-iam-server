import { faker } from '@faker-js/faker';
import { type OrganisationID } from '../types/aggregate-ids.types.js';
import { KafkaKlasseUpdatedEvent } from './kafka-klasse-updated.event.js';

describe('KafkaKlasseUpdatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const organisationId: OrganisationID = faker.string.uuid();
        const name: string = faker.string.alphanumeric(16);
        const administriertVon: OrganisationID = faker.string.uuid();

        const event: KafkaKlasseUpdatedEvent = new KafkaKlasseUpdatedEvent(organisationId, name, administriertVon);

        expect(event).toBeInstanceOf(KafkaKlasseUpdatedEvent);
        expect(event.kafkaKey).toBe(organisationId);
    });
});
