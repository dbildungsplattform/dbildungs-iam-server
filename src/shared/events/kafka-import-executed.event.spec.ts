import { faker } from '@faker-js/faker';
import { type OrganisationID, type RolleID } from '../types/aggregate-ids.types.js';
import { KafkaImportExecutedEvent } from './kafka-import-executed.event.js';

describe('KafkaImportExecutedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const importVorgangId: string = faker.string.uuid();
        const organisationId: OrganisationID = faker.string.uuid();
        const rolleId: RolleID = faker.string.uuid();
        const keycloakUserId: string = faker.string.uuid();

        const event: KafkaImportExecutedEvent = new KafkaImportExecutedEvent(
            importVorgangId,
            organisationId,
            rolleId,
            keycloakUserId,
        );

        expect(event).toBeInstanceOf(KafkaImportExecutedEvent);
        expect(event.kafkaKey).toBe(importVorgangId);
    });
});
