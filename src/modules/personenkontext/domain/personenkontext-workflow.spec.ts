import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createPersonPermissionsMock, DoFactory } from '../../../../test/utils/index.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { DbiamPersonenkontextBodyParams } from '../api/param/dbiam-personenkontext.body.params.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { PersonenkontexteUpdateError } from './error/personenkontexte-update.error.js';
import { PersonenkontextWorkflowSharedKernel } from './personenkontext-workflow-shared-kernel.js';
import { PersonenkontextWorkflowFactory } from './personenkontext-workflow.factory.js';
import { PersonenkontextWorkflowAggregate } from './personenkontext-workflow.js';
import { OperationContext } from './personenkontext.enums.js';
import { PersonenkontextFactory } from './personenkontext.factory.js';
import { Personenkontext } from './personenkontext.js';

describe('PersonenkontextWorkflow', () => {
    let module: TestingModule;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let anlage: PersonenkontextWorkflowAggregate;
    let personenkontextAnlageFactory: PersonenkontextWorkflowFactory;
    let personpermissionsMock: DeepMocked<PersonPermissions>;
    let dbiamPersonenkontextFactoryMock: DeepMocked<DbiamPersonenkontextFactory>;
    let configMock: DeepMocked<ConfigService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonenkontextWorkflowFactory,
                PersonenkontextFactory,
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonPermissions,
                    useValue: createPersonPermissionsMock(),
                },
                {
                    provide: DbiamPersonenkontextFactory,
                    useValue: createMock(DbiamPersonenkontextFactory),
                },
                {
                    provide: ConfigService,
                    useValue: createMock(ConfigService),
                },
                {
                    provide: PersonenkontextWorkflowSharedKernel,
                    useValue: createMock(PersonenkontextWorkflowSharedKernel),
                },
            ],
        }).compile();
        rolleRepoMock = module.get(RolleRepo);
        organisationRepoMock = module.get(OrganisationRepository);
        dbiamPersonenkontextFactoryMock = module.get(DbiamPersonenkontextFactory);
        personenkontextAnlageFactory = module.get(PersonenkontextWorkflowFactory);
        personpermissionsMock = module.get(PersonPermissions);
        configMock = module.get(ConfigService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        anlage = personenkontextAnlageFactory.createNew();
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(anlage).toBeDefined();
    });

    describe('initialize', () => {
        it('should initialize the aggregate with the selected Organisation and Rolle', () => {
            anlage.initialize('person-id', 'org-id', ['role-id']);
            expect(anlage.personId).toBe('person-id');
            expect(anlage.selectedOrganisationId).toBe('org-id');
            expect(anlage.selectedRolleIds).toStrictEqual(['role-id']);
        });
    });

    describe('findAllSchulstrukturknoten', () => {
        it('should return only the organisations that the admin has rights on', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            const organisations: Organisation<true>[] = [organisation];
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue(organisations);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [organisation.id],
            });

            anlage.initialize('person-id', 'org-id');

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );
            expect(
                organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mock.calls[0] &&
                    organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mock.calls[0][2],
            ).toEqual([organisation.id]);
            expect(result.length).toBe(1);
            expect(result[0]?.id).toBe(organisation.id);
        });

        it('should return the organisation it was initialized with as well', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, { kennung: '7654321' });
            const organisations: Organisation<true>[] = [organisation];
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue(organisations);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [organisation.id],
            });
            const selectedOrganisation: Organisation<true> = DoFactory.createOrganisation(true, {
                id: 'org-id',
                kennung: '1234567',
            });
            organisationRepoMock.findById.mockResolvedValue(selectedOrganisation);

            anlage.initialize('person-id', 'org-id');

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );
            expect(
                organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mock.calls[0] &&
                    organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mock.calls[0][2],
            ).toEqual([organisation.id]);
            expect(result.length).toBe(2);
            expect(result[0]?.id).toBe(selectedOrganisation.id);
            expect(result[1]?.id).toBe(organisation.id);
        });

        it('should return organisations based on name or kennung if provided', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            const organisations: Organisation<true>[] = [organisation];
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue(organisations);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [organisation.id],
            });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                organisation.name,
            );
            expect(
                organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mock.calls[0] &&
                    organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mock.calls[0][1],
            ).toEqual(organisation.name);
            expect(result.length).toBe(1);
        });

        it('should return an empty array if no organisations are found', async () => {
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );
            expect(result.length).toBe(0);
        });

        it('should sort organisations by name and kennung', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                kennung: 'K1',
                name: 'Beta School',
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {
                kennung: 'K2',
                name: 'Alpha School',
            });
            const org3: Organisation<true> = DoFactory.createOrganisation(true, { name: 'Gamma School' });
            const org4: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K3' });
            const orgsWithRecht: string[] = [org1.id, org2.id, org3.id, org4.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([
                org1,
                org2,
                org3,
                org4,
            ]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(4);
        });

        it('should sort organisations with only kennung defined', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K2' });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K1' });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(2);
        });

        it('should handle organisations with undefined kennung and name', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K1' });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, { name: 'Alpha School' });
            const org3: Organisation<true> = DoFactory.createOrganisation(true, {});
            const orgsWithRecht: string[] = [org1.id, org2.id, org3.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2, org3]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(3);
        });

        it('should handle organisations with kennung but undefined name', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K1', name: 'tootie' });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, { name: undefined });
            const org3: Organisation<true> = DoFactory.createOrganisation(true, {});
            const orgsWithRecht: string[] = [org1.id, org2.id, org3.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2, org3]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(3);
        });

        it('should handle organisations with name but undefined kennung', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                kennung: undefined,
                name: 'rolle',
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, { name: 'tootie' });
            const org3: Organisation<true> = DoFactory.createOrganisation(true, {});
            const orgsWithRecht: string[] = [org1.id, org2.id, org3.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2, org3]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(3);
        });
        it('should sort organisations with neither kennung nor name defined', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {});
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {});
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(2);
        });

        it('should handle mixed cases of kennung and name', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                kennung: 'K2',
                name: 'Beta School',
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, { name: 'Alpha School' });
            const org3: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'K1' });
            const org4: Organisation<true> = DoFactory.createOrganisation(true, {});
            const orgsWithRecht: string[] = [org1.id, org2.id, org3.id, org4.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([
                org1,
                org2,
                org3,
                org4,
            ]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(4);
        });

        it('should sort organisations with only name defined', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, { name: 'Beta School' });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, { name: 'Alpha School' });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(2);
        });
        it('should handle organisations with neither kennung nor name defined and return them as equal', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                name: undefined,
                kennung: undefined,
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {
                name: undefined,
                kennung: undefined,
            });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toEqual(2);
        });
        it('should handle organisations with kennung defined but name undefined', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                name: undefined,
                kennung: '123',
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {
                name: undefined,
                kennung: '123',
            });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toEqual(2);
        });
        it('should handle organisations with kennung defined but name undefined', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                name: undefined,
                kennung: undefined,
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {
                name: undefined,
                kennung: '123',
            });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toEqual(2);
        });
        it('should handle organisations with name and kennung', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                name: 'Carl-Orff',
                kennung: '123',
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {
                name: 'Amalie',
                kennung: '321',
            });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toEqual(2);
        });
        it('should handle organisations with name and kennung', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                name: 'Carl-Orff',
                kennung: undefined,
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {
                name: 'Amalie',
                kennung: '321',
            });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toEqual(2);
        });
        it('should handle organisations with name and kennung', async () => {
            const org1: Organisation<true> = DoFactory.createOrganisation(true, {
                name: 'Carl-Orff',
                kennung: '321',
            });
            const org2: Organisation<true> = DoFactory.createOrganisation(true, {
                name: 'Amalie',
                kennung: undefined,
            });
            const orgsWithRecht: string[] = [org1.id, org2.id];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([org1, org2]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: orgsWithRecht });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toEqual(2);
        });

        it('should call findByNameOrKennungAndExcludeByOrganisationType with undefined orgaIds when all permissions are granted', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            const organisations: Organisation<true>[] = [organisation];

            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue(organisations);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            // Ensure that the method is called with undefined orgaIds
            expect(organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType).toHaveBeenCalledWith(
                OrganisationsTyp.KLASSE,
                undefined,
                undefined,
                undefined,
            );

            expect(result).toEqual(organisations);
        });

        it('should return an empty array if no organisations are found', async () => {
            organisationRepoMock.findByNameOrKennungAndExcludeByOrganisationType.mockResolvedValue([]);
            personpermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: ['someId'] });

            const result: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
                personpermissionsMock,
                undefined,
            );

            expect(result.length).toBe(0); // Verify that the result is empty
        });
    });

    describe('commit', () => {
        it('should successfully commit personenkontexte', async () => {
            const personId: string = faker.string.uuid();
            const lastModified: Date = faker.date.recent();
            const count: number = 1;
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [];

            const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
            const updateResult: Personenkontext<true>[] = [personenkontext];

            dbiamPersonenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValue({
                update: vi.fn().mockResolvedValue(updateResult),
            } as never);

            const result: Personenkontext<true>[] | PersonenkontexteUpdateError = await anlage.commit(
                personId,
                lastModified,
                count,
                personenkontexte,
                personpermissionsMock,
            );

            expect(result).toEqual(updateResult);
        });

        it('should return an error if PersonenkontexteUpdateError is returned', async () => {
            const personId: string = faker.string.uuid();
            const lastModified: Date = faker.date.recent();
            const count: number = 1;
            const personenkontexte: DbiamPersonenkontextBodyParams[] = [];

            const updateError: PersonenkontexteUpdateError = new PersonenkontexteUpdateError('Error message');
            dbiamPersonenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValue({
                update: vi.fn().mockResolvedValue(updateError),
            } as never);

            const result: PersonenkontexteUpdateError | Personenkontext<true>[] = await anlage.commit(
                personId,
                lastModified,
                count,
                personenkontexte,
                personpermissionsMock,
            );

            expect(result).toBeInstanceOf(PersonenkontexteUpdateError);
        });
    });

    describe('checkPermissions', () => {
        it('should return undefined if user has limited anlegen permissions and only limited rollen are assigned', async () => {
            configMock.getOrThrow.mockReturnValueOnce({
                LIMITED_ROLLENART_ALLOWLIST: [RollenArt.LERN],
            });
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const lehrRolle: Rolle<true> = DoFactory.createRolle(true, {
                id: faker.string.uuid(),
                name: 'Test Rolle',
                rollenart: RollenArt.LERN,
            });
            const rolleMap: Map<string, Rolle<true>> = new Map([[lehrRolle.id, lehrRolle]]);
            rolleRepoMock.findByIds.mockResolvedValue(rolleMap);

            const result: Option<DomainError> = await anlage.checkPermissions(
                permissions,
                undefined,
                'orgId',
                [lehrRolle.id],
                OperationContext.PERSON_ANLEGEN,
            );

            expect(result).toBe(undefined);
        });

        it('should return undefined if context is PERSON_BEARBEITEN and user has systemrecht PERSONEN_VERWALTEN', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const result: Option<DomainError> = await anlage.checkPermissions(
                permissions,
                undefined,
                'orgId',
                [],
                OperationContext.PERSON_BEARBEITEN,
            );

            expect(result).toBe(undefined);
        });

        describe.each([[OperationContext.PERSON_ANLEGEN], [OperationContext.PERSON_BEARBEITEN]])(
            'when context is %s',
            (operationContext: OperationContext) => {
                it('should return error if user does not have the correct rights', async () => {
                    const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                    if (operationContext === OperationContext.PERSON_ANLEGEN) {
                        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
                        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
                    } else if (operationContext === OperationContext.PERSON_BEARBEITEN) {
                        permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
                    }

                    const lehrRolle: Rolle<true> = DoFactory.createRolle(true, {
                        id: faker.string.uuid(),
                        name: 'Test Rolle',
                        rollenart: RollenArt.LERN,
                    });
                    const leitRolle: Rolle<true> = DoFactory.createRolle(true, {
                        id: faker.string.uuid(),
                        name: 'Test Rolle',
                        rollenart: RollenArt.LEIT,
                    });
                    const rolleMap: Map<string, Rolle<true>> = new Map([
                        [lehrRolle.id, lehrRolle],
                        [leitRolle.id, leitRolle],
                    ]);
                    rolleRepoMock.findByIds.mockResolvedValue(rolleMap);

                    const result: Option<DomainError> = await anlage.checkPermissions(
                        permissions,
                        undefined,
                        'orgId',
                        [lehrRolle.id, leitRolle.id],
                        operationContext,
                    );

                    expect(result).toBeInstanceOf(DomainError);
                });

                it('should return error if config is not set for limited rollenarten', async () => {
                    configMock.getOrThrow.mockReturnValueOnce({ LIMITED_ROLLENART_ALLOWLIST: undefined });

                    const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                    permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
                    permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

                    const lehrRolle: Rolle<true> = DoFactory.createRolle(true, {
                        id: faker.string.uuid(),
                        name: 'Test Rolle',
                        rollenart: RollenArt.LERN,
                    });
                    const rolleMap: Map<string, Rolle<true>> = new Map([[lehrRolle.id, lehrRolle]]);
                    rolleRepoMock.findByIds.mockResolvedValue(rolleMap);

                    const result: Option<DomainError> = await anlage.checkPermissions(
                        permissions,
                        undefined,
                        'orgId',
                        [lehrRolle.id],
                        operationContext,
                    );

                    expect(result).toBeInstanceOf(DomainError);
                });

                it('should return error if personid is set but user is not allowed to modify', async () => {
                    const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                    permissions.canModifyPerson.mockResolvedValueOnce(false);

                    const result: Option<DomainError> = await anlage.checkPermissions(
                        permissions,
                        'personId',
                        'orgId',
                        ['rolleId'],
                        operationContext,
                    );

                    expect(result).toBeInstanceOf(DomainError);
                });
            },
        );
    });

    it('should return an empty array if no personenkontexte are passed', async () => {
        const personId: string = faker.string.uuid();
        const lastModified: Date = faker.date.recent();
        const count: number = 0;
        const personenkontexte: DbiamPersonenkontextBodyParams[] = [];

        dbiamPersonenkontextFactoryMock.createNewPersonenkontexteUpdate.mockReturnValue({
            update: vi.fn().mockResolvedValue([]),
        } as never);

        const result: Personenkontext<true>[] | PersonenkontexteUpdateError = await anlage.commit(
            personId,
            lastModified,
            count,
            personenkontexte,
            personpermissionsMock,
        );

        expect(result).toEqual([]);
    });
});
