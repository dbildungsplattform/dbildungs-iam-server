import { faker } from '@faker-js/faker';
import { type OrganisationID } from '../types/aggregate-ids.types.js';
import { KafkaKlasseCreatedEvent } from './kafka-klasse-created.event.js';

describe('KafkaKlasseCreatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const organisationId: OrganisationID = faker.string.uuid();
        const name: string = faker.string.alphanumeric(16);
        const administriertVon: OrganisationID = faker.string.uuid();

        const event: KafkaKlasseCreatedEvent = new KafkaKlasseCreatedEvent(organisationId, name, administriertVon);

        expect(event).toBeInstanceOf(KafkaKlasseCreatedEvent);
        expect(event.kafkaKey).toBe(organisationId);
    });
});
