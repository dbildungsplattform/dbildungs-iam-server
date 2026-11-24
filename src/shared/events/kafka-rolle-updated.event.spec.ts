import { DoFactory } from '../../../test/utils/do-factory.js';
import { type Rolle } from '../../modules/rolle/domain/rolle.js';
import { KafkaRolleUpdatedEvent } from './kafka-rolle-updated.event.js';

describe('KafkaRolleUpdatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const rolle: Rolle<true> = DoFactory.createRolle(true);

        const event: KafkaRolleUpdatedEvent = KafkaRolleUpdatedEvent.fromRollen(rolle, rolle);

        expect(event).toBeInstanceOf(KafkaRolleUpdatedEvent);
        expect(event.kafkaKey).toBe(rolle.id);
    });
});
