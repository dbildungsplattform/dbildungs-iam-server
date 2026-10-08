import { DoFactory } from '../../../test/utils/do-factory.js';
import { Organisation } from '../../modules/organisation/domain/organisation.js';
import { KafkaSchuleItslearningEnabledEvent } from './kafka-schule-itslearning-enabled.event.js';

describe('KafkaSchuleItslearningEnabledEvent', () => {
    it('should correctly initialize and implement KafkaEvent', () => {
        const orga: Organisation<true> = DoFactory.createOrganisation(true);

        const event: KafkaSchuleItslearningEnabledEvent = new KafkaSchuleItslearningEnabledEvent(
            orga.id,
            orga.typ,
            orga.kennung,
            orga.name,
        );

        expect(event).toBeInstanceOf(KafkaSchuleItslearningEnabledEvent);
        expect(event.kafkaKey).toBe(orga.id);
    });
});
