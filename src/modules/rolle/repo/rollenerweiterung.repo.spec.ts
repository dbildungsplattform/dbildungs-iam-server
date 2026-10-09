import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it } from 'vitest';

import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Ok } from '../../../shared/util/result.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { RollenArt } from '../domain/rolle.enums.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { RollenSystemRecht } from '../domain/systemrecht.js';
import { InternalRollenerweiterungRepo } from './internal-rollenerweiterung.repo.js';
import { RollenerweiterungRepo } from './rollenerweiterung.repo.js';
import { DomainError } from '../../../shared/error/index.js';

describe('RollenerweiterungRepo', () => {
    let sut: RollenerweiterungRepo;
    let internalRollenerweiterungRepoMock: DeepMocked<InternalRollenerweiterungRepo>;
    let permissionsMock: DeepMocked<PersonPermissions>;

    beforeEach(() => {
        internalRollenerweiterungRepoMock = createMock<InternalRollenerweiterungRepo>(InternalRollenerweiterungRepo);

        permissionsMock = createPersonPermissionsMock();

        sut = new RollenerweiterungRepo(internalRollenerweiterungRepoMock);
    });

    function createPersistedRollenerweiterung(
        organisationId: OrganisationID = faker.string.uuid(),
        rolleId: RolleID = faker.string.uuid(),
        serviceProviderId: ServiceProviderID = faker.string.uuid(),
    ): Rollenerweiterung<true> {
        return DoFactory.createRollenerweiterung<true>(true, {
            organisationId,
            rolleId,
            serviceProviderId,
        });
    }

    describe('existsByOrganisationId', () => {
        it('should return MissingPermissionsError if permission is missing', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<boolean, MissingPermissionsError> = await sut.existsByOrganisationId(
                organisationId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(internalRollenerweiterungRepoMock.existsByOrganisationId).not.toHaveBeenCalled();
        });

        it('should return true if Rollenerweiterungen exist', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            internalRollenerweiterungRepoMock.existsByOrganisationId.mockResolvedValueOnce(true);

            const result: Result<boolean, MissingPermissionsError> = await sut.existsByOrganisationId(
                organisationId,
                permissionsMock,
            );

            expect(result).toEqual(Ok(true));
            expect(internalRollenerweiterungRepoMock.existsByOrganisationId).toHaveBeenCalledWith(organisationId);
        });

        it('should return false if no Rollenerweiterungen exist', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            internalRollenerweiterungRepoMock.existsByOrganisationId.mockResolvedValueOnce(false);

            const result: Result<boolean, MissingPermissionsError> = await sut.existsByOrganisationId(
                organisationId,
                permissionsMock,
            );

            expect(result).toEqual(Ok(false));
        });
    });

    describe('findManyByOrganisationId', () => {
        it('should return MissingPermissionsError if permission is missing', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationId(organisationId, permissionsMock);

            expect(result.ok).toBe(false);
            expect(internalRollenerweiterungRepoMock.findManyByOrganisationId).not.toHaveBeenCalled();
        });

        it('should delegate organisation, offset and limit to the internal repository', async () => {
            const organisationId: OrganisationID = faker.string.uuid();
            const offset: number = 5;
            const limit: number = 10;

            const rollenerweiterungen: Rollenerweiterung<true>[] = [createPersistedRollenerweiterung(organisationId)];

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            internalRollenerweiterungRepoMock.findManyByOrganisationId.mockResolvedValueOnce(rollenerweiterungen);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationId(organisationId, permissionsMock, offset, limit);

            expect(result).toEqual(Ok(rollenerweiterungen));
            expect(internalRollenerweiterungRepoMock.findManyByOrganisationId).toHaveBeenCalledWith(
                organisationId,
                offset,
                limit,
            );
        });

        it('should return MissingPermissionsError if permission is missing', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationId(organisationId, permissionsMock);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(internalRollenerweiterungRepoMock.findManyByOrganisationId).not.toHaveBeenCalled();
        });
    });

    describe('findManyByOrganisationAndRolle', () => {
        it('should delegate an empty query without checking permissions', async () => {
            internalRollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([]);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationAndRolle([], permissionsMock);

            expect(result).toEqual(Ok([]));
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
            expect(internalRollenerweiterungRepoMock.findManyByOrganisationAndRolle).toHaveBeenCalledWith([]);
        });

        it('should check permission once per unique organisation', async () => {
            const organisationIdA: OrganisationID = faker.string.uuid();
            const organisationIdB: OrganisationID = faker.string.uuid();

            const query: Array<{
                organisationId: OrganisationID;
                rolleId: RolleID;
            }> = [
                {
                    organisationId: organisationIdA,
                    rolleId: faker.string.uuid(),
                },
                {
                    organisationId: organisationIdA,
                    rolleId: faker.string.uuid(),
                },
                {
                    organisationId: organisationIdB,
                    rolleId: faker.string.uuid(),
                },
            ];

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            internalRollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce([]);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationAndRolle(query, permissionsMock);

            expect(result).toEqual(Ok([]));
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(2);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationIdA,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationIdB,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(internalRollenerweiterungRepoMock.findManyByOrganisationAndRolle).toHaveBeenCalledWith(query);
        });

        it('should return MissingPermissionsError if permission for one organisation is missing', async () => {
            const organisationIdA: OrganisationID = faker.string.uuid();
            const organisationIdB: OrganisationID = faker.string.uuid();

            const query: Array<{
                organisationId: OrganisationID;
                rolleId: RolleID;
            }> = [
                {
                    organisationId: organisationIdA,
                    rolleId: faker.string.uuid(),
                },
                {
                    organisationId: organisationIdB,
                    rolleId: faker.string.uuid(),
                },
            ];

            permissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                (organisationId: OrganisationID): Promise<boolean> =>
                    Promise.resolve(organisationId === organisationIdA),
            );

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationAndRolle(query, permissionsMock);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(internalRollenerweiterungRepoMock.findManyByOrganisationAndRolle).not.toHaveBeenCalled();
        });

        it('should return Rollenerweiterungen from the internal repository', async () => {
            const organisationId: OrganisationID = faker.string.uuid();
            const rolleId: RolleID = faker.string.uuid();

            const query: Array<{
                organisationId: OrganisationID;
                rolleId: RolleID;
            }> = [
                {
                    organisationId,
                    rolleId,
                },
            ];

            const rollenerweiterungen: Rollenerweiterung<true>[] = [
                createPersistedRollenerweiterung(organisationId, rolleId),
            ];

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            internalRollenerweiterungRepoMock.findManyByOrganisationAndRolle.mockResolvedValueOnce(rollenerweiterungen);

            const result: Result<Rollenerweiterung<true>[], MissingPermissionsError> =
                await sut.findManyByOrganisationAndRolle(query, permissionsMock);

            expect(result).toEqual(Ok(rollenerweiterungen));
        });
    });

    describe('countByServiceProviderIds', () => {
        it('should delegate to the internal repository', async () => {
            const serviceProviderIdA: ServiceProviderID = faker.string.uuid();
            const serviceProviderIdB: ServiceProviderID = faker.string.uuid();

            const counts: Record<ServiceProviderID, number> = {
                [serviceProviderIdA]: 2,
                [serviceProviderIdB]: 0,
            };

            internalRollenerweiterungRepoMock.countByServiceProviderIds.mockResolvedValueOnce(counts);

            const result: Record<ServiceProviderID, number> = await sut.countByServiceProviderIds([
                serviceProviderIdA,
                serviceProviderIdB,
            ]);

            expect(result).toEqual(counts);
            expect(internalRollenerweiterungRepoMock.countByServiceProviderIds).toHaveBeenCalledWith([
                serviceProviderIdA,
                serviceProviderIdB,
            ]);
        });
    });

    describe('findByServiceProviderIds', () => {
        it('should return MissingPermissionsError if no permitted organisations exist', async () => {
            const serviceProviderIds: ServiceProviderID[] = [faker.string.uuid()];

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [],
            });

            const result: Result<
                Map<ServiceProviderID, Rollenerweiterung<true>[]>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIds(serviceProviderIds, permissionsMock);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                false,
                false,
            );
            expect(internalRollenerweiterungRepoMock.findByServiceProviderIds).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError if the requested organisation is not permitted', async () => {
            const serviceProviderIds: ServiceProviderID[] = [faker.string.uuid()];

            const permittedOrganisationId: OrganisationID = faker.string.uuid();

            const requestedOrganisationId: OrganisationID = faker.string.uuid();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [permittedOrganisationId],
            });

            const result: Result<
                Map<ServiceProviderID, Rollenerweiterung<true>[]>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIds(serviceProviderIds, permissionsMock, requestedOrganisationId);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(result.error.message).toBe('Insufficient permissions for the requested organisationId');
            expect(internalRollenerweiterungRepoMock.findByServiceProviderIds).not.toHaveBeenCalled();
        });

        it('should query all organisations if the person has global permission', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const map: Map<ServiceProviderID, Rollenerweiterung<true>[]> = new Map([[serviceProviderId, []]]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: true,
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIds.mockResolvedValueOnce(map);

            const result: Result<
                Map<ServiceProviderID, Rollenerweiterung<true>[]>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIds([serviceProviderId], permissionsMock);

            expect(result).toEqual(Ok(map));
            expect(internalRollenerweiterungRepoMock.findByServiceProviderIds).toHaveBeenCalledWith(
                [serviceProviderId],
                undefined,
            );
        });

        it('should restrict the query to all permitted organisations', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const permittedOrganisationIds: OrganisationID[] = [faker.string.uuid(), faker.string.uuid()];

            const map: Map<ServiceProviderID, Rollenerweiterung<true>[]> = new Map([[serviceProviderId, []]]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: permittedOrganisationIds,
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIds.mockResolvedValueOnce(map);

            const result: Result<
                Map<ServiceProviderID, Rollenerweiterung<true>[]>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIds([serviceProviderId], permissionsMock);

            expect(result).toEqual(Ok(map));
            expect(internalRollenerweiterungRepoMock.findByServiceProviderIds).toHaveBeenCalledWith(
                [serviceProviderId],
                permittedOrganisationIds,
            );
        });

        it('should restrict the query to the requested permitted organisation', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const requestedOrganisationId: OrganisationID = faker.string.uuid();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [requestedOrganisationId, faker.string.uuid()],
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIds.mockResolvedValueOnce(
                new Map([[serviceProviderId, []]]),
            );

            const result: Result<
                Map<ServiceProviderID, Rollenerweiterung<true>[]>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIds([serviceProviderId], permissionsMock, requestedOrganisationId);

            expect(result.ok).toBe(true);
            expect(internalRollenerweiterungRepoMock.findByServiceProviderIds).toHaveBeenCalledWith(
                [serviceProviderId],
                [requestedOrganisationId],
            );
        });

        it('should allow a requested organisation if the person has global permission', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const requestedOrganisationId: OrganisationID = faker.string.uuid();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: true,
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIds.mockResolvedValueOnce(
                new Map([[serviceProviderId, []]]),
            );

            const result: Result<
                Map<ServiceProviderID, Rollenerweiterung<true>[]>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIds([serviceProviderId], permissionsMock, requestedOrganisationId);

            expect(result.ok).toBe(true);
            expect(internalRollenerweiterungRepoMock.findByServiceProviderIds).toHaveBeenCalledWith(
                [serviceProviderId],
                [requestedOrganisationId],
            );
        });
    });

    describe('findByServiceProviderIdPagedAndSortedByOrgaKennung', () => {
        it('should return MissingPermissionsError if no permitted organisations exist', async () => {
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [],
            });

            const result: Result<
                Counted<Rollenerweiterung<true>>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(faker.string.uuid(), permissionsMock);

            expect(result.ok).toBe(false);
            expect(
                internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung,
            ).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError if one requested organisation is not permitted', async () => {
            const permittedOrganisationId: OrganisationID = faker.string.uuid();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [permittedOrganisationId],
            });

            const result: Result<
                Counted<Rollenerweiterung<true>>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(faker.string.uuid(), permissionsMock, [
                permittedOrganisationId,
                faker.string.uuid(),
            ]);

            expect(result.ok).toBe(false);
            expect(
                internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung,
            ).not.toHaveBeenCalled();
        });

        it('should use all permitted organisations if none were requested', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const permittedOrganisationIds: OrganisationID[] = [faker.string.uuid(), faker.string.uuid()];

            const rolleIds: RolleID[] = [faker.string.uuid()];

            const offset: number = 5;
            const limit: number = 10;

            const internalResult: Counted<Rollenerweiterung<true>> = [[], 0];

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: permittedOrganisationIds,
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce(
                internalResult,
            );

            const result: Result<
                Counted<Rollenerweiterung<true>>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(
                serviceProviderId,
                permissionsMock,
                undefined,
                rolleIds,
                offset,
                limit,
            );

            expect(result).toEqual(Ok(internalResult));
            expect(
                internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung,
            ).toHaveBeenCalledWith(serviceProviderId, permittedOrganisationIds, rolleIds, offset, limit);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
                false,
                false,
            );
        });

        it('should use no organisation filter if global permission exists', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: true,
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [],
                0,
            ]);

            const result: Result<
                Counted<Rollenerweiterung<true>>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProviderId, permissionsMock);

            expect(result.ok).toBe(true);
            expect(
                internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung,
            ).toHaveBeenCalledWith(serviceProviderId, undefined, undefined, undefined, undefined);
        });

        it('should use explicitly requested permitted organisations', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const requestedOrganisationIds: OrganisationID[] = [faker.string.uuid(), faker.string.uuid()];

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [...requestedOrganisationIds, faker.string.uuid()],
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [],
                0,
            ]);

            const result: Result<
                Counted<Rollenerweiterung<true>>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(
                serviceProviderId,
                permissionsMock,
                requestedOrganisationIds,
            );

            expect(result.ok).toBe(true);
            expect(
                internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung,
            ).toHaveBeenCalledWith(serviceProviderId, requestedOrganisationIds, undefined, undefined, undefined);
        });

        it('should use no organisation filter for an empty requested array with global permission', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: true,
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [],
                0,
            ]);

            const result: Result<
                Counted<Rollenerweiterung<true>>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProviderId, permissionsMock, []);

            expect(result.ok).toBe(true);
            expect(
                internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung,
            ).toHaveBeenCalledWith(serviceProviderId, undefined, undefined, undefined, undefined);
        });

        it('should use all permitted organisations for an empty requested organisation array', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const permittedOrganisationIds: OrganisationID[] = [faker.string.uuid(), faker.string.uuid()];

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: permittedOrganisationIds,
            });

            internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung.mockResolvedValueOnce([
                [],
                0,
            ]);

            const result: Result<
                Counted<Rollenerweiterung<true>>,
                MissingPermissionsError
            > = await sut.findByServiceProviderIdPagedAndSortedByOrgaKennung(serviceProviderId, permissionsMock, []);

            expect(result).toEqual(Ok([[], 0]));
            expect(
                internalRollenerweiterungRepoMock.findByServiceProviderIdPagedAndSortedByOrgaKennung,
            ).toHaveBeenCalledWith(serviceProviderId, permittedOrganisationIds, undefined, undefined, undefined);
        });
    });

    describe('deleteByOrganisationIdAndServiceProviderIds', () => {
        it('should return MissingPermissionsError without deleting if permission is missing', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const serviceProviderIds: ServiceProviderID[] = [faker.string.uuid()];

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<null, DomainError | MissingPermissionsError> =
                await sut.deleteByOrganisationIdAndServiceProviderIds(
                    organisationId,
                    serviceProviderIds,
                    permissionsMock,
                );

            expect(result.ok).toBe(false);
            expect(
                internalRollenerweiterungRepoMock.deleteByOrganisationIdAndServiceProviderIds,
            ).not.toHaveBeenCalled();
        });

        it('should delegate deletion if permission exists', async () => {
            const organisationId: OrganisationID = faker.string.uuid();
            const serviceProviderIds: ServiceProviderID[] = [faker.string.uuid(), faker.string.uuid()];

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            internalRollenerweiterungRepoMock.deleteByOrganisationIdAndServiceProviderIds.mockResolvedValueOnce(
                Ok(null),
            );

            const result: Result<null, DomainError | MissingPermissionsError> =
                await sut.deleteByOrganisationIdAndServiceProviderIds(
                    organisationId,
                    serviceProviderIds,
                    permissionsMock,
                );

            expect(result).toEqual(Ok(null));
            expect(internalRollenerweiterungRepoMock.deleteByOrganisationIdAndServiceProviderIds).toHaveBeenCalledWith(
                organisationId,
                serviceProviderIds,
            );
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
        });

        it('should return MissingPermissionsError without deleting if permission is missing', async () => {
            const organisationId: OrganisationID = faker.string.uuid();

            const serviceProviderIds: ServiceProviderID[] = [faker.string.uuid()];

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<null, DomainError | MissingPermissionsError> =
                await sut.deleteByOrganisationIdAndServiceProviderIds(
                    organisationId,
                    serviceProviderIds,
                    permissionsMock,
                );

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(
                internalRollenerweiterungRepoMock.deleteByOrganisationIdAndServiceProviderIds,
            ).not.toHaveBeenCalled();
        });
    });

    describe('deleteByServiceProviderIdAndRollenarten', () => {
        it('should delete if there are no affected Rollenerweiterungen', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            internalRollenerweiterungRepoMock.findByServiceProviderIdAndRollenarten.mockResolvedValueOnce([]);

            internalRollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten.mockResolvedValueOnce(Ok(null));

            const result: Result<null, DomainError | MissingPermissionsError> =
                await sut.deleteByServiceProviderIdAndRollenarten(serviceProviderId, permissionsMock);

            expect(result).toEqual(Ok(null));
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
            expect(internalRollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten).toHaveBeenCalledWith(
                serviceProviderId,
                undefined,
            );
        });

        it('should check permission once per affected organisation', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const organisationIdA: OrganisationID = faker.string.uuid();
            const organisationIdB: OrganisationID = faker.string.uuid();

            const rollenarten: RollenArt[] = [RollenArt.LEHR];

            internalRollenerweiterungRepoMock.findByServiceProviderIdAndRollenarten.mockResolvedValueOnce([
                createPersistedRollenerweiterung(organisationIdA, faker.string.uuid(), serviceProviderId),
                createPersistedRollenerweiterung(organisationIdA, faker.string.uuid(), serviceProviderId),
                createPersistedRollenerweiterung(organisationIdB, faker.string.uuid(), serviceProviderId),
            ]);

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            internalRollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten.mockResolvedValueOnce(Ok(null));

            const result: Result<null, DomainError | MissingPermissionsError> =
                await sut.deleteByServiceProviderIdAndRollenarten(serviceProviderId, permissionsMock, rollenarten);

            expect(result).toEqual(Ok(null));
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(2);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationIdA,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisationIdB,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            expect(internalRollenerweiterungRepoMock.findByServiceProviderIdAndRollenarten).toHaveBeenCalledWith(
                serviceProviderId,
                rollenarten,
            );
            expect(internalRollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten).toHaveBeenCalledWith(
                serviceProviderId,
                rollenarten,
            );
        });

        it('should return MissingPermissionsError and not delete if one affected organisation is not permitted', async () => {
            const serviceProviderId: ServiceProviderID = faker.string.uuid();

            const organisationIdA: OrganisationID = faker.string.uuid();
            const organisationIdB: OrganisationID = faker.string.uuid();

            internalRollenerweiterungRepoMock.findByServiceProviderIdAndRollenarten.mockResolvedValueOnce([
                createPersistedRollenerweiterung(organisationIdA, faker.string.uuid(), serviceProviderId),
                createPersistedRollenerweiterung(organisationIdB, faker.string.uuid(), serviceProviderId),
            ]);

            permissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                (organisationId: OrganisationID): Promise<boolean> =>
                    Promise.resolve(organisationId === organisationIdA),
            );

            const result: Result<null, DomainError | MissingPermissionsError> =
                await sut.deleteByServiceProviderIdAndRollenarten(serviceProviderId, permissionsMock);

            expect(result.ok).toBe(false);
            if (result.ok) {
                throw new Error('Expected operation to fail');
            }
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect(internalRollenerweiterungRepoMock.deleteByServiceProviderIdAndRollenarten).not.toHaveBeenCalled();
        });
    });
});
