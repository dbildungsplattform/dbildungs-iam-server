import { DoFactory } from '../../../test/utils/index.js';
import { type Organisation } from '../../modules/organisation/domain/organisation.js';
import { KafkaOrganisationDeletedEvent } from './kafka-organisation-deleted.event.js';

describe('KafkaOrganisationDeletedEvent', () => {
    let orga: Organisation<true>;
    beforeEach(() => {
        orga = DoFactory.createOrganisation(true);
    });

    describe('get kafkaKey', () => {
        it('should return key', () => {
            const event: KafkaOrganisationDeletedEvent = new KafkaOrganisationDeletedEvent(
                orga.id,
                orga.name,
                orga.kennung,
                orga.typ,
            );
            expect(event.kafkaKey).toBe(orga.id);
        });
    });

    describe('fromOrganisation', () => {
        it('should match orga', () => {
            const event: KafkaOrganisationDeletedEvent = KafkaOrganisationDeletedEvent.fromOrganisation(orga);
            expect(event).toEqual(
                expect.objectContaining({
                    organisationId: orga.id,
                    name: orga.name,
                    kennung: orga.kennung,
                    typ: orga.typ,
                }),
            );
        });
    });
});
