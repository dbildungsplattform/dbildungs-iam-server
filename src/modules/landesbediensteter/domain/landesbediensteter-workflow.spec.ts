import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';

import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonLandesbediensteterSearchService } from '../../person/person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { DbiamPersonenkontextBodyParams } from '../../personenkontext/api/param/dbiam-personenkontext.body.params.js';
import { DbiamPersonenkontextFactory } from '../../personenkontext/domain/dbiam-personenkontext.factory.js';
import { PersonenkontexteUpdateError } from '../../personenkontext/domain/error/personenkontexte-update.error.js';
import { PersonenkontextWorkflowSharedKernel } from '../../personenkontext/domain/personenkontext-workflow-shared-kernel.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { PersonenkontexteUpdate } from '../../personenkontext/domain/personenkontexte-update.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleNurAnPassendeOrganisationError } from '../../personenkontext/specification/error/rolle-nur-an-passende-organisation.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { LandesbediensteterWorkflowFactory } from './landesbediensteter-workflow.factory.js';
import { LandesbediensteterWorkflowAggregate } from './landesbediensteter-workflow.js';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createPersonenkontexteUpdateMock } from '../../../../test/utils/workflow.mocks.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { MockedObject } from 'vitest';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { EscalatedPersonPermissions } from '../../permission/escalated-person-permissions.js';

describe('LandesbediensteterWorkflow', () => {
    let module: TestingModule;

    let sut: LandesbediensteterWorkflowAggregate;

    let factory: LandesbediensteterWorkflowFactory;

    const personRepoMock: DeepMocked<PersonRepository> = createMock(PersonRepository);
    const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
    const organisationRepoMock: DeepMocked<OrganisationRepository> = createMock(OrganisationRepository);
    const personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo> = createMock(DBiamPersonenkontextRepo);
    const personenkontextFactoryMock: DeepMocked<DbiamPersonenkontextFactory> = createMock(DbiamPersonenkontextFactory);
    const landesbediensteteServiceMock: DeepMocked<PersonLandesbediensteterSearchService> = createMock(
        PersonLandesbediensteterSearchService,
    );
    const personenkontextWorkflowSharedKernelMock: DeepMocked<PersonenkontextWorkflowSharedKernel> = createMock(
        PersonenkontextWorkflowSharedKernel,
    );
    const escalatedPersonPermissionsFactoryMock: DeepMocked<EscalatedPersonPermissionsFactory> = createMock(
        EscalatedPersonPermissionsFactory,
    );

    function mockCheckPermissions(permissionsMock: DeepMocked<PersonPermissions>, success: boolean): void {
        permissionsMock.hasSystemrechteAtOrganisation.mockResolvedValueOnce(success);
    }

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                LandesbediensteterWorkflowFactory,
                { provide: PersonRepository, useValue: personRepoMock },
                { provide: RolleRepo, useValue: rolleRepoMock },
                { provide: OrganisationRepository, useValue: organisationRepoMock },
                { provide: DBiamPersonenkontextRepo, useValue: personenkontextRepoMock },
                { provide: DbiamPersonenkontextFactory, useValue: personenkontextFactoryMock },
                { provide: PersonLandesbediensteterSearchService, useValue: landesbediensteteServiceMock },
                { provide: PersonenkontextWorkflowSharedKernel, useValue: personenkontextWorkflowSharedKernelMock },
                {
                    provide: EscalatedPersonPermissionsFactory,
                    useValue: escalatedPersonPermissionsFactoryMock,
                },
            ],
        })
            .overrideProvider(EscalatedPersonPermissionsFactory)
            .useValue(escalatedPersonPermissionsFactoryMock)
            .compile();

        factory = module.get(LandesbediensteterWorkflowFactory);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        sut = factory.createNew();
    });

    describe('findAllSchulstrukturknoten', () => {
        it('should return empty array if not allowed', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });

            const result: Organisation<true>[] = await sut.findAllSchulstrukturknoten(
                permissions,
                undefined,
                undefined,
                undefined,
            );

            expect(result).toHaveLength(0);
        });

        it('should return empty array if no valid orgas found', async () => {
            const orgaName: string = faker.word.noun();

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValueOnce([]);

            const result: Organisation<true>[] = await sut.findAllSchulstrukturknoten(
                permissions,
                orgaName,
                undefined,
                25,
            );

            expect(organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType).toHaveBeenCalledWith(
                OrganisationsTyp.KLASSE,
                orgaName,
                undefined,
                25,
            );
            expect(result).toHaveLength(0);
        });

        it('should return empty array if no valid orgas found', async () => {
            const orgaName: string = faker.word.noun();
            const orgaId: string = faker.string.uuid();

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [orgaId] });
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValueOnce([]);

            const result: Organisation<true>[] = await sut.findAllSchulstrukturknoten(
                permissions,
                orgaName,
                undefined,
                25,
            );

            expect(organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType).toHaveBeenCalledWith(
                OrganisationsTyp.KLASSE,
                orgaName,
                [orgaId],
                25,
            );
            expect(result).toHaveLength(0);
        });

        it('should only return matching orgas', async () => {
            const orgaA: Organisation<true> = DoFactory.createOrganisation(true);
            const orgaB: Organisation<true> = DoFactory.createOrganisation(true);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [orgaA.id, orgaB.id] });
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValueOnce([orgaA]);

            const result: Organisation<true>[] = await sut.findAllSchulstrukturknoten(
                permissions,
                orgaA.name,
                undefined,
                25,
            );

            expect(organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType).toHaveBeenCalledWith(
                OrganisationsTyp.KLASSE,
                orgaA.name,
                [orgaA.id, orgaB.id],
                25,
            );
            expect(result).toHaveLength(1);
        });

        it('should fetch requested organisation if they were not included in the search', async () => {
            const orgaA: Organisation<true> = DoFactory.createOrganisation(true);
            const orgaB: Organisation<true> = DoFactory.createOrganisation(true);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [orgaA.id] });
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValueOnce([orgaA]);
            organisationRepoMock.findById.mockResolvedValueOnce(orgaB);

            sut.initialize(orgaB.id, []);

            const result: Organisation<true>[] = await sut.findAllSchulstrukturknoten(
                permissions,
                orgaA.name,
                undefined,
                25,
            );

            expect(result).toHaveLength(2);
        });

        describe('special cases', () => {
            it('should correctly sort organisations', async () => {
                const orgas: Organisation<true>[] = [
                    DoFactory.createOrganisation(true, { name: undefined }),
                    DoFactory.createOrganisation(true, { kennung: undefined }),
                    DoFactory.createOrganisation(true),
                    DoFactory.createOrganisation(true, { name: undefined }),
                    DoFactory.createOrganisation(true, { kennung: undefined }),
                    DoFactory.createOrganisation(true, { name: undefined }),
                    DoFactory.createOrganisation(true),
                ];

                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: orgas.map((o: Organisation<true>) => o.id),
                });
                organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValueOnce(orgas);

                const result: Organisation<true>[] = await sut.findAllSchulstrukturknoten(
                    permissions,
                    undefined,
                    undefined,
                    25,
                );

                expect(result).toHaveLength(orgas.length);
            });
        });
    });

    describe('findRollenForOrganisation', () => {
        it('should return empty array if not allowed', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            sut.initialize(faker.string.uuid(), []);

            const result: Rolle<true>[] = await sut.findRollenForOrganisation(permissions, undefined, undefined, 25);

            expect(result).toHaveLength(0);
        });

        it('should return empty array if organisation could not be found', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            organisationRepoMock.findById.mockResolvedValueOnce(undefined);

            sut.initialize(faker.string.uuid(), []);

            const result: Rolle<true>[] = await sut.findRollenForOrganisation(permissions, undefined, undefined, 25);

            expect(result).toHaveLength(0);
        });

        it('should work if rollen name is given', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            organisationRepoMock.findById.mockResolvedValueOnce(orga);
            rolleRepoMock.findByName.mockResolvedValueOnce([rolle]);

            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValue(Ok());

            sut.initialize(faker.string.uuid(), []);

            const result: Rolle<true>[] = await sut.findRollenForOrganisation(permissions, rolle.name, undefined, 25);

            expect(result).toHaveLength(1);
        });

        it('should only return allowed rollen', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rollen: Rolle<true>[] = [
                DoFactory.createRolle(true),
                DoFactory.createRolle(true),
                DoFactory.createRolle(true),
            ];

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            organisationRepoMock.findById.mockResolvedValueOnce(orga);
            rolleRepoMock.findByRollenArten.mockResolvedValueOnce(rollen);

            // One of the rollen is not assignable
            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValueOnce(Ok());
            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValueOnce(Ok());
            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValueOnce(
                Err(new RolleNurAnPassendeOrganisationError()),
            );

            sut.initialize(faker.string.uuid(), []);

            const result: Rolle<true>[] = await sut.findRollenForOrganisation(permissions, undefined, undefined, 25);

            expect(result).toHaveLength(2);
        });

        it('should include rollen from rollenIds even if not allowed by reference check', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);

            const allowedRolle: Rolle<true> = DoFactory.createRolle(true);
            const explicitlySelectedRolle: Rolle<true> = DoFactory.createRolle(true);

            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            organisationRepoMock.findById.mockResolvedValueOnce(orga);

            rolleRepoMock.findByRollenArten.mockResolvedValueOnce([allowedRolle, explicitlySelectedRolle]);

            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValue(Ok());

            rolleRepoMock.findByIds.mockResolvedValueOnce(
                new Map([[explicitlySelectedRolle.id, explicitlySelectedRolle]]),
            );

            sut.initialize(orga.id, []);

            const result: Rolle<true>[] = await sut.findRollenForOrganisation(
                permissions,
                undefined,
                [explicitlySelectedRolle.id],
                25,
            );

            // Expect both rollen to be returned, including the explicitly selected one
            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining([allowedRolle, explicitlySelectedRolle]));
        });
    });

    describe('canCommit', () => {
        it('should return no error if checks pass', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValue(Ok());
            mockCheckPermissions(permissions, true);
            sut.initialize(faker.string.uuid(), [faker.string.uuid()]);

            const result: Result<void, DomainError> = await sut.canCommit(permissions);

            expect(result).toEqual({ ok: true, value: undefined });
        });

        it('should return error if rolle can not be assigned', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValue(
                Err(new RolleNurAnPassendeOrganisationError()),
            );
            sut.initialize(faker.string.uuid(), [faker.string.uuid()]);

            const result: Result<void, DomainError> = await sut.canCommit(permissions);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            expect(result).toEqual({ ok: false, error: expect.any(DomainError) });
        });

        it('should return error if permissions are missing', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personenkontextWorkflowSharedKernelMock.checkReferences.mockResolvedValue(Ok());
            mockCheckPermissions(permissions, false);
            sut.initialize(faker.string.uuid(), [faker.string.uuid()]);

            const result: Result<void, DomainError> = await sut.canCommit(permissions);

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            expect(result).toEqual({ ok: false, error: expect.any(DomainError) });
        });
    });

    describe('commit', () => {
        it('should use PersonenkontexteUpdate', async () => {
            const personId: string = faker.string.uuid();
            const lastModified: Date = new Date();
            const count: number = 0;
            const newPersonenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                },
            ];
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            const escalatedPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            escalatedPersonPermissionsFactoryMock.fromPermissions.mockResolvedValue(
                escalatedPermissions as unknown as EscalatedPersonPermissions,
            );

            const personalnummer: string = faker.string.numeric(7);
            personRepoMock.findById.mockResolvedValueOnce(DoFactory.createPerson(true));
            landesbediensteteServiceMock.personIsSearchable.mockResolvedValueOnce({ ok: true, value: undefined });

            const pkupdateMock: MockedObject<PersonenkontexteUpdate> = createPersonenkontexteUpdateMock();

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([DoFactory.createPersonenkontext(true)]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkupdateMock);

            await sut.commit(personId, lastModified, count, newPersonenkontexte, permissions, personalnummer);

            // Check the constructed permissions passed to the workflow
            await expect(
                (
                    (
                        personenkontextFactoryMock.createNewPersonenkontexteUpdate.mock.calls[0] as unknown[]
                    )[4] as IPersonPermissions
                ).canModifyPerson(personId),
            ).resolves.toBe(true);
            expect(pkupdateMock.update).toHaveBeenCalled();
        });

        it('should return error if missing permissions on orga', async () => {
            const personId: string = faker.string.uuid();
            const lastModified: Date = new Date();
            const count: number = 0;
            const newPersonenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                },
            ];
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            const personalnummer: string = faker.string.numeric(7);

            const pkupdateMock: MockedObject<PersonenkontexteUpdate> = createPersonenkontexteUpdateMock();

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkupdateMock);

            const result: Result<Personenkontext<true>[], PersonenkontexteUpdateError> = await sut.commit(
                personId,
                lastModified,
                count,
                newPersonenkontexte,
                permissions,
                personalnummer,
            );

            expect(result).toEqual({
                ok: false,
                error: new MissingPermissionsError(
                    'Not allowed to add Landesbedienstete to the requested organisations.',
                ),
            });
        });

        it('should return error if person can not be found', async () => {
            const personId: string = faker.string.uuid();
            const lastModified: Date = new Date();
            const count: number = 0;
            const newPersonenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                },
            ];
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            const personalnummer: string = faker.string.numeric(7);
            personRepoMock.findById.mockResolvedValueOnce(undefined);

            const pkupdateMock: MockedObject<PersonenkontexteUpdate> = createPersonenkontexteUpdateMock();

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkupdateMock);

            const result: Result<Personenkontext<true>[], PersonenkontexteUpdateError> = await sut.commit(
                personId,
                lastModified,
                count,
                newPersonenkontexte,
                permissions,
                personalnummer,
            );

            expect(result).toEqual({
                ok: false,
                error: new EntityNotFoundError('Person', personId),
            });
        });

        it('should return error if person is not allowed to be searched for', async () => {
            const person: Person<true> = DoFactory.createPerson(true);
            const lastModified: Date = new Date();
            const count: number = 0;
            const newPersonenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                },
            ];
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            const personalnummer: string = faker.string.numeric(7);
            personRepoMock.findById.mockResolvedValueOnce(person);
            landesbediensteteServiceMock.personIsSearchable.mockResolvedValueOnce({
                ok: false,
                error: new EntityNotFoundError('Test Error'),
            });

            const pkupdateMock: MockedObject<PersonenkontexteUpdate> = createPersonenkontexteUpdateMock();

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkupdateMock);

            const result: Result<Personenkontext<true>[], PersonenkontexteUpdateError> = await sut.commit(
                person.id,
                lastModified,
                count,
                newPersonenkontexte,
                permissions,
                personalnummer,
            );

            expect(result).toEqual({
                ok: false,
                error: new EntityNotFoundError('Person', person.id),
            });
        });
    });
});
