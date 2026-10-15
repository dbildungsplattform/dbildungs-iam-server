import { DoFactory } from '../../../test/utils/do-factory.js';
import { RootDirectChildrenType } from '../../modules/organisation/domain/organisation.enums.js';
import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { KafkaSchuleCreatedEvent } from './kafka-schule-created.event.js';

describe('KafkaSchuleCreatedEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const orga: Organisation<true> = DoFactory.createOrganisation(true);

        const event: KafkaSchuleCreatedEvent = new KafkaSchuleCreatedEvent(
            orga.id,
            orga.kennung,
            orga.name,
            RootDirectChildrenType.OEFFENTLICH,
        );

        expect(event).toBeInstanceOf(KafkaSchuleCreatedEvent);
        expect(event.kafkaKey).toBe(orga.id);
    });
});
