import { DoFactory } from '../../../../test/utils/index.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { type ServiceProvider } from '../domain/service-provider.js';
import { ManageableServiceProviderSimpleListEntryResponse } from './manageable-service-provider-simple-list-entry.response.js';

describe('ManageableServiceProviderSimpleListEntryResponse', () => {
    describe('constructor', () => {
        it('should set administrationsebene.name to empty string if organisation.name is undefined', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, { name: undefined });
            const rollen: Rolle<true>[] = [DoFactory.createRolle(true)];

            const response: ManageableServiceProviderSimpleListEntryResponse =
                new ManageableServiceProviderSimpleListEntryResponse(
                    serviceProvider,
                    organisation,
                    rollen,
                    false,
                    false,
                );

            expect(response.administrationsebene.name).toBe('');
            expect(response.rollenartenWhitelist).toEqual(serviceProvider.rollenartenWhitelist);
        });
    });
});
