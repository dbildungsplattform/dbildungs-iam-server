import { DoFactory } from '../../../test/utils/do-factory.js';
import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { type Rolle } from '../../modules/rolle/domain/rolle.js';
import { type ServiceProvider } from '../../modules/service-provider/domain/service-provider.js';
import { KafkaRollenerweiterungCreatedEvent } from './kafka-rollenerweiterung-created.event.js';

describe('KafkaRollenerweiterungCreatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const orga: Organisation<true> = DoFactory.createOrganisation(true);
        const rolle: Rolle<true> = DoFactory.createRolle(true);
        const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);

        const event: KafkaRollenerweiterungCreatedEvent = new KafkaRollenerweiterungCreatedEvent(
            orga.id,
            rolle.id,
            serviceProvider.id,
        );

        expect(event).toBeInstanceOf(KafkaRollenerweiterungCreatedEvent);
        expect(event.kafkaKey).toBe(`${orga.id}-${rolle.id}-${serviceProvider.id}`);
    });
});
