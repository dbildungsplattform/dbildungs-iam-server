import { DoFactory } from '../../../../test/utils/index.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { ServiceProvider } from '../domain/service-provider.js';
import {
    ManageableServiceProviderWithReferencedObjects,
    RollenerweiterungForManageableServiceProvider,
} from '../domain/types.js';
import { ManageableServiceProviderListEntryResponse } from './manageable-service-provider-list-entry.response.js';

describe('ManageableServiceProviderListEntryResponse', () => {
    describe('constructor', () => {
        it('should set administrationsebene.name to empty string if organisation.name is undefined', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, { name: undefined });
            const rollen: Rolle<true>[] = [DoFactory.createRolle(true)];
            const rollenerweiterungen: RollenerweiterungForManageableServiceProvider[] = [];

            const response: ManageableServiceProviderListEntryResponse = new ManageableServiceProviderListEntryResponse(
                serviceProvider,
                organisation,
                rollen,
                rollenerweiterungen,
                false,
            );

            expect(response.administrationsebene.name).toBe('');
            expect(response.rollenartenWhitelist).toEqual(serviceProvider.rollenartenWhitelist);
        });
    });

    describe('fromManageableServiceProviderWithReferencedObjects', () => {
        it('should set rollenerweiterungen to an empty array if manageableServiceProviderWithReferencedObjects.rollenerweiterungen is undefined', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            const rollen: Rolle<true>[] = [DoFactory.createRolle(true)];

            const manageableServiceProviderWithReferencedObjects: ManageableServiceProviderWithReferencedObjects = {
                serviceProvider,
                organisation,
                rollen,
                rollenerweiterungen: [],
                rollenerweiterungenWithName: undefined,
                hasSomeVerwaltenPermission: false,
            };
            const response: ManageableServiceProviderListEntryResponse =
                ManageableServiceProviderListEntryResponse.fromManageableServiceProviderWithReferencedObjects(
                    manageableServiceProviderWithReferencedObjects,
                );
            expect(response.rollenerweiterungen).toEqual([]);
        });
    });
});
