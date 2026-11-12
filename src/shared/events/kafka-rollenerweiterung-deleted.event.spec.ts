import { DoFactory } from '../../../test/utils/do-factory.js';
import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { type Rolle } from '../../modules/rolle/domain/rolle.js';
import { type ServiceProvider } from '../../modules/service-provider/domain/service-provider.js';
import { KafkaRollenerweiterungDeletedEvent } from './kafka-rollenerweiterung-deleted.event.js';

describe('KafkaRollenerweiterungDeletedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const orga: Organisation<true> = DoFactory.createOrganisation(true);
        const rolle: Rolle<true> = DoFactory.createRolle(true);
        const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);

        const event: KafkaRollenerweiterungDeletedEvent = new KafkaRollenerweiterungDeletedEvent(
            orga.id,
            rolle.id,
            serviceProvider.id,
        );

        expect(event).toBeInstanceOf(KafkaRollenerweiterungDeletedEvent);
        expect(event.kafkaKey).toBe(rolle.id);
    });
});
