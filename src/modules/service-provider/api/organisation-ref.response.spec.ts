import { DoFactory } from '../../../../test/utils/index.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRefResponse } from './organisation-ref.response.js';

describe('OrganisationRefResponse', () => {
    describe('fromOrganisation', () => {
        it('should set name to empty string if organisation.name is undefined', () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, { name: undefined });
            const response: OrganisationRefResponse = OrganisationRefResponse.fromOrganisation(organisation);

            expect(response.name).toBe('');
        });
    });
});
