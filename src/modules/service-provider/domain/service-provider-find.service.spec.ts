import { faker } from '@faker-js/faker';

import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { ServiceProviderFindService } from './service-provider-find.service.js';
import { ServiceProvider } from './service-provider.js';

describe('ServiceProviderFindService', () => {
    let sut: ServiceProviderFindService;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let permissionsMock: DeepMocked<PersonPermissions>;

    beforeEach(() => {
        organisationRepoMock = createMock(OrganisationRepository);
        serviceProviderRepoMock = createMock(ServiceProviderRepo);
        permissionsMock = createPersonPermissionsMock();

        sut = new ServiceProviderFindService(organisationRepoMock, serviceProviderRepoMock);
    });

    describe('findServiceProvidersForRolleBySchulstrukturknotenAuthorized', () => {
        it('should return missing permissions error when user is not authorized', async () => {
            const schulstrukturknotenId: string = faker.string.uuid();
            permissionsMock.hasSystemrechteAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<ServiceProvider<true>[], MissingPermissionsError> =
                await sut.findServiceProvidersForRolleBySchulstrukturknotenAuthorized(
                    permissionsMock,
                    schulstrukturknotenId,
                );

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(result.error.message).toBe('Rollen Verwalten Systemrecht Required For This Endpoint');
            expect(permissionsMock.hasSystemrechteAtOrganisation).toHaveBeenCalledWith(schulstrukturknotenId, [
                RollenSystemRecht.ROLLEN_VERWALTEN,
            ]);
            expect(organisationRepoMock.findParentOrgasForIdSortedByDepthAsc).not.toHaveBeenCalled();
            expect(serviceProviderRepoMock.findBySchulstrukturknoten).not.toHaveBeenCalled();
        });

        it('should return assignable service providers when user is authorized', async () => {
            const schulstrukturknotenId: string = faker.string.uuid();
            const parentOrga: Organisation<true> = DoFactory.createOrganisation(true);
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                providedOnSchulstrukturknoten: parentOrga.id,
            });

            permissionsMock.hasSystemrechteAtOrganisation.mockResolvedValueOnce(true);
            organisationRepoMock.findParentOrgasForIdSortedByDepthAsc.mockResolvedValueOnce([parentOrga]);
            serviceProviderRepoMock.findBySchulstrukturknoten.mockResolvedValueOnce([serviceProvider]);

            const result: Result<ServiceProvider<true>[], MissingPermissionsError> =
                await sut.findServiceProvidersForRolleBySchulstrukturknotenAuthorized(
                    permissionsMock,
                    schulstrukturknotenId,
                );

            expectOkResult(result);
            expect(result.value).toEqual([serviceProvider]);
            expect(organisationRepoMock.findParentOrgasForIdSortedByDepthAsc).toHaveBeenCalledWith(
                schulstrukturknotenId,
            );
            expect(serviceProviderRepoMock.findBySchulstrukturknoten).toHaveBeenCalledWith([parentOrga.id]);
        });

        it('should return empty list when user is authorized and no service providers were found', async () => {
            const schulstrukturknotenId: string = faker.string.uuid();
            const parentOrga: Organisation<true> = DoFactory.createOrganisation(true);

            permissionsMock.hasSystemrechteAtOrganisation.mockResolvedValueOnce(true);
            organisationRepoMock.findParentOrgasForIdSortedByDepthAsc.mockResolvedValueOnce([parentOrga]);
            serviceProviderRepoMock.findBySchulstrukturknoten.mockResolvedValueOnce([]);

            const result: Result<ServiceProvider<true>[], MissingPermissionsError> =
                await sut.findServiceProvidersForRolleBySchulstrukturknotenAuthorized(
                    permissionsMock,
                    schulstrukturknotenId,
                );

            expectOkResult(result);
            expect(result.value).toEqual([]);
            expect(serviceProviderRepoMock.findBySchulstrukturknoten).toHaveBeenCalledWith([parentOrga.id]);
        });
    });
});
