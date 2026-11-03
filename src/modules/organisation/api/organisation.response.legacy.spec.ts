import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Organisation } from '../domain/organisation.js';
import { OrganisationResponseLegacy } from './organisation.response.legacy.js';

describe('OrganisationResponseLegacy', () => {
    it('should map the organisation properties', () => {
        const organisation: Organisation<true> = DoFactory.createOrganisation(true);

        const response: OrganisationResponseLegacy = new OrganisationResponseLegacy(organisation);

        expect(response).toEqual(
            expect.objectContaining({
                id: organisation.id,
                administriertVon: organisation.administriertVon,
                kennung: organisation.kennung,
                name: organisation.name,
                namensergaenzung: organisation.namensergaenzung,
                kuerzel: organisation.kuerzel,
                typ: organisation.typ,
            }),
        );
    });
});
