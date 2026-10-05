import { faker } from '@faker-js/faker';
import { cloneDeep } from 'lodash-es';
import { DoFactory } from '../../../test/utils/do-factory.js';
import { Organisation } from '../../modules/organisation/domain/organisation.js';
import { SchuleUpdatedEvent } from './schule-updated.event.js';

describe('SchuleUpdatedEvent', () => {
    it('should correctly initialize and implement SchuleUpdatedEvent', () => {
        const organisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);
        const oldOrganisation: Organisation<true> = cloneDeep(organisation);

        organisation.kennung = faker.string.numeric();
        organisation.name = faker.company.name();
        organisation.itslearningEnabled = true;
        organisation.administriertVon = faker.string.uuid();
        organisation.zugehoerigZu = faker.string.uuid();

        const event: SchuleUpdatedEvent = SchuleUpdatedEvent.fromOrganisations(organisation, oldOrganisation);

        expect(event).toBeInstanceOf(SchuleUpdatedEvent);
        expect(event.organisationId).toEqual(organisation.id);
        expect(event.kennung).toEqual(organisation.kennung);
        expect(event.oldKennung).toEqual(oldOrganisation.kennung);
        expect(event.name).toEqual(organisation.name);
        expect(event.oldName).toEqual(oldOrganisation.name);
        expect(event.itslearningEnabled).toEqual(organisation.itslearningEnabled);
        expect(event.administriertVon).toEqual(organisation.administriertVon);
        expect(event.oldAdministriertVon).toEqual(oldOrganisation.administriertVon);
        expect(event.zugehoerigZu).toEqual(organisation.zugehoerigZu);
        expect(event.oldZugehoerigZu).toEqual(oldOrganisation.zugehoerigZu);
    });
});
