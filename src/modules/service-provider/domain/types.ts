/* v8 ignore file @preserv */
// types can not be covered by v8, since the code does not exist at runtime

import { Organisation } from '../../organisation/domain/organisation.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { Rollenerweiterung } from '../../rolle/domain/rollenerweiterung.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { ServiceProviderKategorie } from './service-provider.enum.js';
import { ServiceProvider } from './service-provider.js';

export type ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount = {
    serviceProvider: ServiceProvider<true>;
    organisation: Organisation<true>;
    rollen: Rolle<true>[];
    hasRollenerweiterungen: boolean;
    hasSomeVerwaltenPermission: boolean;
};

export type ManageableServiceProviderWithReferencedObjects = {
    serviceProvider: ServiceProvider<true>;
    organisation: Organisation<true>;
    rollen: Rolle<true>[];
    rollenerweiterungen: Rollenerweiterung<true>[];
    rollenerweiterungenWithName?: RollenerweiterungForManageableServiceProvider[];
    hasSomeVerwaltenPermission: boolean;
};

export type ManageableServiceProviderDetailsWithReferencedObjects = {
    serviceProvider: ServiceProvider<true>;
    organisation: Organisation<true>;
    rollen: Rolle<true>[];
    rollenerweiterungen: Rollenerweiterung<true>[];
    rollenerweiterungenWithName?: RollenerweiterungForManageableServiceProvider[];
    relevantSystemrechte: RollenSystemRecht[];
};

export type RollenerweiterungForManageableServiceProvider = {
    serviceProviderId: string;
    organisation: Organisation<true>;
    rolle: Rolle<true>;
};

export type ManageableServiceProviderFilter = {
    kategorien?: ServiceProviderKategorie[];
    searchFilter?: string;
    limit?: number;
    offset?: number;
};
