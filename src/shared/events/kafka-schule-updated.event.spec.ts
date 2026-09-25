import { faker } from '@faker-js/faker';
import { OrganisationID } from '../types/aggregate-ids.types.js';
import { KafkaSchuleUpdatedEvent } from './kafka-schule-updated.event.js';

describe('KafkaSchuleUpdatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const organisationId: OrganisationID = faker.string.uuid();
        const oldName: string = faker.company.name();
        const newName: string = faker.company.name();
        const oldKennung: string = faker.string.numeric();
        const newKennung: string = faker.string.numeric();

        const event: KafkaSchuleUpdatedEvent = new KafkaSchuleUpdatedEvent(
            organisationId,
            oldName,
            newName,
            oldKennung,
            newKennung,
        );

        expect(event).toBeInstanceOf(KafkaSchuleUpdatedEvent);
        expect(event.kafkaKey).toBe(organisationId);
    });
});