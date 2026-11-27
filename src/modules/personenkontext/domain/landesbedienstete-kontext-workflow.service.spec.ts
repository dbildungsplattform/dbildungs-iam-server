import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/index.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { type IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { PersonLandesbediensteterSearchService } from '../../person/person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { type DbiamPersonenkontextBodyParams } from '../api/param/dbiam-personenkontext.body.params.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { LandesbediensteteKontextWorkflowService } from './landesbedienstete-kontext-workflow.service.js';
import { type Personenkontext } from './personenkontext.js';
import { type PersonenkontexteUpdate } from './personenkontexte-update.js';

describe('LandesbediensteteKontextWorkflowService', () => {
    let module: TestingModule;
    let sut: LandesbediensteteKontextWorkflowService;

    let landesbediensteteSearchServiceMock: DeepMocked<PersonLandesbediensteterSearchService>;
    let escalatedPermissionsFactoryMock: DeepMocked<EscalatedPersonPermissionsFactory>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personenkontextFactoryMock: DeepMocked<DbiamPersonenkontextFactory>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                LandesbediensteteKontextWorkflowService,
                {
                    provide: PersonLandesbediensteterSearchService,
                    useValue: createMock(PersonLandesbediensteterSearchService),
                },
                { provide: EscalatedPersonPermissionsFactory, useValue: createMock(EscalatedPersonPermissionsFactory) },
                { provide: DBiamPersonenkontextRepo, useValue: createMock(DBiamPersonenkontextRepo) },
                { provide: DbiamPersonenkontextFactory, useValue: createMock(DbiamPersonenkontextFactory) },
            ],
        }).compile();

        sut = module.get(LandesbediensteteKontextWorkflowService);
        landesbediensteteSearchServiceMock = module.get(PersonLandesbediensteterSearchService);
        escalatedPermissionsFactoryMock = module.get(EscalatedPersonPermissionsFactory);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personenkontextFactoryMock = module.get(DbiamPersonenkontextFactory);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('commit', () => {
        it('should return personenkontexte with updated contexts after successful commit', async () => {
            const personId: string = faker.string.uuid();
            const personalnummer: string = faker.string.alphanumeric(5);
            const lastModified: Date = faker.date.past();
            const count: number = 1;
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(true),
            } as DeepMocked<IPersonPermissions>;
            const organisationId: string = faker.string.uuid();
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
            ];

            const createdPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
            const updatedPermissions: DeepMocked<
                Awaited<ReturnType<EscalatedPersonPermissionsFactory['fromPermissions']>>
            > = {
                hasSystemrechteAtOrganisation: vi.fn(),
            } as unknown as DeepMocked<Awaited<ReturnType<EscalatedPersonPermissionsFactory['fromPermissions']>>>;
            const pkUpdateMock: PersonenkontexteUpdate = {
                update: vi.fn().mockResolvedValueOnce([createdPersonenkontext]),
            } as unknown as PersonenkontexteUpdate;

            landesbediensteteSearchServiceMock.personIsSearchable.mockResolvedValueOnce(Ok(undefined));
            escalatedPermissionsFactoryMock.fromPermissions.mockResolvedValueOnce(updatedPermissions);
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkUpdateMock);

            const result: Personenkontext<true>[] | DomainError = await sut.commit(
                personId,
                lastModified,
                count,
                personenkontexte,
                permissionsMock,
                personalnummer,
            );

            expect(Array.isArray(result)).toBe(true);
            expect((result as Personenkontext<true>[])[0]).toEqual(createdPersonenkontext);
            expect(permissionsMock.hasSystemrechteAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                expect.arrayContaining([RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN]),
            );
            expect(landesbediensteteSearchServiceMock.personIsSearchable).toHaveBeenCalledWith(personId);
            expect(escalatedPermissionsFactoryMock.fromPermissions).toHaveBeenCalled();
            expect(personenkontextRepoMock.findByPerson).toHaveBeenCalledWith(personId);
        });

        it('should return error if permissions check fails during commit', async () => {
            const personId: string = faker.string.uuid();
            const organisationId: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(false),
            } as DeepMocked<IPersonPermissions>;
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
            ];

            const result: Personenkontext<true>[] | DomainError = await sut.commit(
                personId,
                undefined,
                1,
                personenkontexte,
                permissionsMock,
            );

            expect(result).toBeInstanceOf(MissingPermissionsError);
            expect(escalatedPermissionsFactoryMock.fromPermissions).not.toHaveBeenCalled();
        });

        it('should return error if person is not searchable', async () => {
            const personId: string = faker.string.uuid();
            const organisationId: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(true),
            } as DeepMocked<IPersonPermissions>;
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
            ];
            const searchError: DomainError = new MissingPermissionsError('Person not searchable');

            landesbediensteteSearchServiceMock.personIsSearchable.mockResolvedValueOnce(Err(searchError));

            const result: Personenkontext<true>[] | DomainError = await sut.commit(
                personId,
                undefined,
                1,
                personenkontexte,
                permissionsMock,
            );

            expect(result).toEqual(searchError);
            expect(escalatedPermissionsFactoryMock.fromPermissions).not.toHaveBeenCalled();
        });

        it('should return error if no target organisations provided', async () => {
            const personId: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn(),
            } as DeepMocked<IPersonPermissions>;

            const result: Personenkontext<true>[] | DomainError = await sut.commit(
                personId,
                undefined,
                1,
                [],
                permissionsMock,
            );

            expect(result).toBeInstanceOf(MissingPermissionsError);
            expect((result as MissingPermissionsError).message).toContain('No target organisation');
        });

        it('should merge existing contexts with new ones', async () => {
            const personId: string = faker.string.uuid();
            const organisationId: string = faker.string.uuid();
            const personalnummer: string = faker.string.alphanumeric(5);
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(true),
            } as DeepMocked<IPersonPermissions>;
            const newPersonenkontext: DbiamPersonenkontextBodyParams = {
                organisationId,
                rolleId: faker.string.uuid(),
            } as unknown as DbiamPersonenkontextBodyParams;
            const existingPersonenkontext: DbiamPersonenkontextBodyParams = {
                organisationId: faker.string.uuid(),
                rolleId: faker.string.uuid(),
            } as unknown as DbiamPersonenkontextBodyParams;

            const createdPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
            const updatedPermissions: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn(),
            } as DeepMocked<IPersonPermissions>;
            const pkUpdateMock: PersonenkontexteUpdate = {
                update: vi.fn().mockResolvedValueOnce([createdPersonenkontext]),
            } as unknown as PersonenkontexteUpdate;

            landesbediensteteSearchServiceMock.personIsSearchable.mockResolvedValueOnce(Ok(undefined));
            escalatedPermissionsFactoryMock.fromPermissions.mockResolvedValueOnce(
                updatedPermissions as unknown as Awaited<
                    ReturnType<EscalatedPersonPermissionsFactory['fromPermissions']>
                >,
            );
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([
                existingPersonenkontext as unknown as Personenkontext<true>,
            ]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkUpdateMock);

            await sut.commit(personId, undefined, 1, [newPersonenkontext], permissionsMock, personalnummer);

            expect(personenkontextFactoryMock.createNewPersonenkontexteUpdate).toHaveBeenCalledWith(
                personId,
                undefined,
                1,
                [existingPersonenkontext, newPersonenkontext],
                updatedPermissions,
                personalnummer,
            );
        });

        it('should apply escalated permissions before creating update', async () => {
            const personId: string = faker.string.uuid();
            const organisationId: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(true),
            } as DeepMocked<IPersonPermissions>;
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
            ];

            const createdPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
            const escalatedPermissions: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn(),
            } as DeepMocked<IPersonPermissions>;
            const pkUpdateMock: PersonenkontexteUpdate = {
                update: vi.fn().mockResolvedValueOnce([createdPersonenkontext]),
            } as unknown as PersonenkontexteUpdate;

            landesbediensteteSearchServiceMock.personIsSearchable.mockResolvedValueOnce(Ok(undefined));
            escalatedPermissionsFactoryMock.fromPermissions.mockResolvedValueOnce(
                escalatedPermissions as unknown as Awaited<
                    ReturnType<EscalatedPersonPermissionsFactory['fromPermissions']>
                >,
            );
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkUpdateMock);

            await sut.commit(personId, undefined, 1, personenkontexte, permissionsMock);

            expect(escalatedPermissionsFactoryMock.fromPermissions).toHaveBeenCalledWith(permissionsMock, [
                {
                    orgaId: 'ROOT',
                    systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
                },
            ]);
        });
    });

    describe('checkPermissions', () => {
        it('should return Ok if user has required system rights at organisation', async () => {
            const organisationId: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(true),
            } as DeepMocked<IPersonPermissions>;

            const result: Result<void, DomainError> = await sut.checkPermissions(permissionsMock, organisationId);

            expectOkResult(result);
            expect(permissionsMock.hasSystemrechteAtOrganisation).toHaveBeenCalledWith(
                organisationId,
                expect.arrayContaining([RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN]),
            );
        });

        it('should return Err if user does not have required system rights', async () => {
            const organisationId: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(false),
            } as DeepMocked<IPersonPermissions>;

            const result: Result<void, DomainError> = await sut.checkPermissions(permissionsMock, organisationId);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(MissingPermissionsError);
            expect((result.error as MissingPermissionsError).message).toContain('Unauthorized');
        });
    });

    describe('commit with multiple personenkontexte', () => {
        it('should check permissions for all target organisations', async () => {
            const personId: string = faker.string.uuid();
            const organisationId1: string = faker.string.uuid();
            const organisationId2: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true),
            } as DeepMocked<IPersonPermissions>;
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId: organisationId1,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
                {
                    organisationId: organisationId2,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
            ];

            const createdPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
            const updatedPermissions: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn(),
            } as DeepMocked<IPersonPermissions>;
            const pkUpdateMock: PersonenkontexteUpdate = {
                update: vi.fn().mockResolvedValueOnce([createdPersonenkontext]),
            } as unknown as PersonenkontexteUpdate;

            landesbediensteteSearchServiceMock.personIsSearchable.mockResolvedValueOnce(Ok(undefined));
            escalatedPermissionsFactoryMock.fromPermissions.mockResolvedValueOnce(
                updatedPermissions as unknown as Awaited<
                    ReturnType<EscalatedPersonPermissionsFactory['fromPermissions']>
                >,
            );
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            personenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValueOnce(pkUpdateMock);

            await sut.commit(personId, undefined, 1, personenkontexte, permissionsMock);

            expect(permissionsMock.hasSystemrechteAtOrganisation).toHaveBeenCalledTimes(2);
            expect(permissionsMock.hasSystemrechteAtOrganisation).toHaveBeenNthCalledWith(
                1,
                organisationId1,
                expect.arrayContaining([RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN]),
            );
            expect(permissionsMock.hasSystemrechteAtOrganisation).toHaveBeenNthCalledWith(
                2,
                organisationId2,
                expect.arrayContaining([RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN]),
            );
        });

        it('should return error if permission check fails for one of the organisations', async () => {
            const personId: string = faker.string.uuid();
            const organisationId1: string = faker.string.uuid();
            const organisationId2: string = faker.string.uuid();
            const permissionsMock: DeepMocked<IPersonPermissions> = {
                hasSystemrechteAtOrganisation: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
            } as DeepMocked<IPersonPermissions>;
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [
                {
                    organisationId: organisationId1,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
                {
                    organisationId: organisationId2,
                    rolleId: faker.string.uuid(),
                } as unknown as DbiamPersonenkontextBodyParams,
            ];

            const result: Personenkontext<true>[] | DomainError = await sut.commit(
                personId,
                undefined,
                1,
                personenkontexte,
                permissionsMock,
            );

            expect(result).toBeInstanceOf(MissingPermissionsError);
            expect(escalatedPermissionsFactoryMock.fromPermissions).not.toHaveBeenCalled();
        });
    });
});
