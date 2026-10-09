import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DbSeedService } from './db-seed.service.js';
import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import fs from 'fs';
import { DataProviderFile } from '../file/data-provider-file.js';
import { PersonFactory } from '../../../modules/person/domain/person.factory.js';
import { PersonRepository } from '../../../modules/person/persistence/person.repository.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { EntityNotFoundError } from '../../../shared/error/index.js';
import { faker } from '@faker-js/faker';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { Rolle } from '../../../modules/rolle/domain/rolle.js';
import { RolleFactory } from '../../../modules/rolle/domain/rolle.factory.js';
import { ServiceProviderRepo } from '../../../modules/service-provider/repo/service-provider.repo.js';
import { ServiceProviderFactory } from '../../../modules/service-provider/domain/service-provider.factory.js';
import { KeycloakUserService, User } from '../../../modules/keycloak-administration/index.js';
import { Person } from '../../../modules/person/domain/person.js';
import { DBiamPersonenkontextService } from '../../../modules/personenkontext/domain/dbiam-personenkontext.service.js';
import { DbSeedReferenceRepo } from '../repo/db-seed-reference.repo.js';
import { ServiceProvider } from '../../../modules/service-provider/domain/service-provider.js';
import { GleicheRolleAnKlasseWieSchuleError } from '../../../modules/personenkontext/specification/error/gleiche-rolle-an-klasse-wie-schule.error.js';
import { PersonenkontextFactory } from '../../../modules/personenkontext/domain/personenkontext.factory.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { KeycloakGroupRoleService } from '../../../modules/keycloak-administration/domain/keycloak-group-role.service.js';
import { Organisation } from '../../../modules/organisation/domain/organisation.js';
import { NameForOrganisationWithTrailingSpaceError } from '../../../modules/organisation/specification/error/name-with-trailing-space.error.js';
import { NameForRolleWithTrailingSpaceError } from '../../../modules/rolle/domain/name-with-trailing-space.error.js';
import { RollenArt, RollenMerkmal } from '../../../modules/rolle/domain/rolle.enums.js';
import { DBiamPersonenkontextRepoInternal } from '../../../modules/personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { EmailDomainRepo } from '../../../email/modules/core/persistence/email-domain.repo.js';
import { EmailDomain } from '../../../email/modules/core/domain/email-domain.js';
import { DbSeedReference } from './db-seed-reference.js';
import { ReferencedEntityType } from '../repo/db-seed-reference.entity.js';
import { InvalidLogoCombinationError } from '../../../modules/service-provider/domain/errors/invalid-logo-combination.error.js';
import { DataConfig, ServerConfig } from '../../../shared/config/index.js';
import { CreateRollenerweiterungError, Rollenerweiterung } from '../../../modules/rolle/domain/rollenerweiterung.js';
import { ServiceProviderMerkmal } from '../../../modules/service-provider/domain/service-provider.enum.js';
import { InternalRollenerweiterungService } from '../../../modules/rolle/domain/internal-rollenerweiterung.service.js';
import { Err, Ok } from '../../../shared/util/result.js';

function createDbSeedReference(): DbSeedReference {
    return DbSeedReference.createNew(ReferencedEntityType.ORGANISATION, faker.number.int(), faker.string.uuid());
}

describe('DbSeedService', () => {
    let module: TestingModule;
    let dbSeedService: DbSeedService;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let rollenerweiterungServiceMock: DeepMocked<InternalRollenerweiterungService>;
    let personRepoMock: DeepMocked<PersonRepository>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let emailDomainRepoMock: DeepMocked<EmailDomainRepo>;
    let personenkontextServiceMock: DeepMocked<DBiamPersonenkontextService>;
    let dbSeedReferenceRepoMock: DeepMocked<DbSeedReferenceRepo>;
    let kcUserService: DeepMocked<KeycloakUserService>;
    let personFactory: DeepMocked<PersonFactory>;
    let configService: ConfigService<ServerConfig>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: false })],
            providers: [
                DbSeedService,
                RolleFactory,
                ServiceProviderFactory,
                PersonenkontextFactory,
                {
                    provide: DBiamPersonenkontextService,
                    useValue: createMock(DBiamPersonenkontextService),
                },
                {
                    provide: DbSeedReferenceRepo,
                    useValue: createMock(DbSeedReferenceRepo),
                },
                {
                    provide: PersonFactory,
                    useValue: createMock(PersonFactory),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: EmailDomainRepo,
                    useValue: createMock(EmailDomainRepo),
                },
                {
                    provide: DBiamPersonenkontextRepoInternal,
                    useValue: createMock(DBiamPersonenkontextRepoInternal),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: InternalRollenerweiterungService,
                    useValue: createMock(InternalRollenerweiterungService),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
                {
                    provide: KeycloakGroupRoleService,
                    useValue: createMock(KeycloakGroupRoleService),
                },
                {
                    provide: EmailDomainRepo,
                    useValue: createMock(EmailDomainRepo),
                },
            ],
        }).compile();
        dbSeedService = module.get(DbSeedService);
        organisationRepositoryMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
        rollenerweiterungServiceMock = module.get(InternalRollenerweiterungService);
        personRepoMock = module.get(PersonRepository);
        serviceProviderRepoMock = module.get(ServiceProviderRepo);
        personenkontextServiceMock = module.get(DBiamPersonenkontextService);
        dbSeedReferenceRepoMock = module.get(DbSeedReferenceRepo);
        kcUserService = module.get(KeycloakUserService);
        personFactory = module.get(PersonFactory);
        emailDomainRepoMock = module.get(EmailDomainRepo);
        configService = module.get(ConfigService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(dbSeedService).toBeDefined();
    });

    describe('readDataProvider', () => {
        describe('readDataProvider with one entity', () => {
            it('should have length 1', () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/all/01/00_data-provider.json`,
                    'utf-8',
                );
                const entities: DataProviderFile[] = dbSeedService.readDataProvider(fileContentAsStr);
                const entity: DataProviderFile | undefined = entities[0];
                const dataProvider: Partial<DataProviderFile> = new DataProviderFile();
                Object.assign(dataProvider, {
                    id: '431d8433-759c-4dbe-aaab-00b9a781f467',
                });
                expect(entities).toHaveLength(1);
                expect(entity).toEqual(dataProvider);
            });
        });
    });

    describe('seedOrganisation', () => {
        describe('without administriertVon and zugehoerigZu', () => {
            it('should insert one entity in database', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/all/01/01_organisation.json`,
                    'utf-8',
                );
                const persistedOrganisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);

                organisationRepositoryMock.saveSeedData.mockResolvedValueOnce(persistedOrganisation);
                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });

        describe('with only nulls', () => {
            it('should insert one entity in database', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/00_organisation_with_only_nulls.json`,
                    'utf-8',
                );
                const persistedOrganisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);

                organisationRepositoryMock.saveSeedData.mockResolvedValueOnce(persistedOrganisation);
                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });

        describe('with overrideId', () => {
            it('should insert one entity in database', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/08_organisation_with_overrideId.json`,
                    'utf-8',
                );
                const persistedOrganisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(persistedOrganisation.id);
                organisationRepositoryMock.findById.mockResolvedValue(persistedOrganisation);

                organisationRepositoryMock.saveSeedData.mockResolvedValueOnce(persistedOrganisation);
                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });

        describe('with existing administriertVon', () => {
            it('should not throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/01_organisation.json`,
                    'utf-8',
                );
                const parent: Organisation<true> = DoFactory.createOrganisation(true);
                organisationRepositoryMock.saveSeedData.mockResolvedValueOnce(parent);
                //USE MockResolved instead of MockRecolvedOnce because it's called for administriert and zugehoerigZu
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockResolvedValue(parent);

                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });

        describe('with existing zugehoerigZu', () => {
            it('should not throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/02_organisation.json`,
                    'utf-8',
                );
                const parent: Organisation<true> = DoFactory.createOrganisation(true);
                organisationRepositoryMock.saveSeedData.mockResolvedValueOnce(parent);
                //USE MockResolved instead of MockRecolvedOnce because it's called for administriert and zugehoerigZu
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockResolvedValue(parent); // mock get-SSK

                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });

        describe('with non existing administriertVon', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/04_missing_administriert-von.json`,
                    'utf-8',
                );
                const persistedOrganisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);

                organisationRepositoryMock.saveSeedData.mockResolvedValueOnce(persistedOrganisation);
                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });

        describe('with non existing zugehoerigZu', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/05_missing_zugehoerig-zu.json`,
                    'utf-8',
                );
                const persistedOrganisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);

                organisationRepositoryMock.save.mockResolvedValueOnce(persistedOrganisation);
                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });
        describe('typ = ROOT', () => {
            it('should assign ROOT_ORGANISATION_ID when typ is ROOT even if kuerzel is not Root', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/06_typ-is-root.json`,
                    'utf-8',
                );
                const persistedOrganisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);

                organisationRepositoryMock.saveSeedData.mockResolvedValueOnce(persistedOrganisation);
                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );

                expect(organisationRepositoryMock.saveSeedData).toHaveBeenCalledTimes(1);
                const savedOrganisation: Organisation<false> =
                    organisationRepositoryMock.saveSeedData.mock.calls[0]![0];
                const rootOrganisationId: string = configService.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
                expect(savedOrganisation.id).toBe(rootOrganisationId);
            });
        });
        describe('Should throw error', () => {
            it('should throw NameForOrganisationWithTrailingSpaceError if OrganisationFactory.createNew returns DomainError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/organisation/07_organisation_with_invalid_name.json`,
                    'utf-8',
                );
                const persistedOrganisation: Organisation<true> = DoFactory.createOrganisationAggregate(true);
                const parent: Organisation<true> = DoFactory.createOrganisation(true);
                organisationRepositoryMock.save.mockResolvedValueOnce(parent);
                //USE MockResolved instead of MockRecolvedOnce because it's called for administriert and zugehoerigZu
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockResolvedValue(parent);

                organisationRepositoryMock.save.mockResolvedValueOnce(persistedOrganisation);
                await expect(dbSeedService.seedOrganisation(fileContentAsStr)).rejects.toThrow(
                    NameForOrganisationWithTrailingSpaceError,
                );
            });
        });
    });

    describe('seedRolle', () => {
        describe('with existing overrideId in seeding file', () => {
            it('should insert one entity in database with overrideId as id', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/rolle/09_rolle_with_override_id.json`,
                    'utf-8',
                );
                const persistedRolle: Rolle<true> = DoFactory.createRolle(true);
                const serviceProviderMocked: ServiceProvider<true> = DoFactory.createServiceProvider(true);

                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced serviceProvider
                serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProviderMocked);
                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock get-SSK

                rolleRepoMock.create.mockResolvedValueOnce(persistedRolle);
                await expect(dbSeedService.seedRolle(fileContentAsStr)).resolves.not.toThrow(EntityNotFoundError);
            });
        });

        describe('with existing organisation for administeredBySchulstrukturknoten and ID', () => {
            it('should insert one entity in database', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/rolle/04_rolle-with-existing-ssk.json`,
                    'utf-8',
                );
                const persistedRolle: Rolle<true> = DoFactory.createRolle(true);
                const serviceProviderMocked: ServiceProvider<true> = DoFactory.createServiceProvider(true);

                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced serviceProvider
                serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProviderMocked);
                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock get-SSK

                rolleRepoMock.create.mockResolvedValueOnce(persistedRolle);
                await expect(dbSeedService.seedRolle(fileContentAsStr)).resolves.not.toThrow(EntityNotFoundError);
            });
        });

        describe('with existing organisation for administeredBySchulstrukturknoten but without ID', () => {
            it('should insert one entity in database', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/rolle/07_rolle_without_id.json`,
                    'utf-8',
                );
                const persistedRolle: Rolle<true> = DoFactory.createRolle(true);
                const serviceProviderMocked: ServiceProvider<true> = DoFactory.createServiceProvider(true);

                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced serviceProvider
                serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProviderMocked);
                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock get-SSK

                rolleRepoMock.save.mockResolvedValueOnce(persistedRolle);
                await expect(dbSeedService.seedRolle(fileContentAsStr)).resolves.not.toThrow(EntityNotFoundError);
            });
        });

        describe('with non-existing organisation for administeredBySchulstrukturknoten', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/rolle/05_rolle-with-non-existing-ssk.json`,
                    'utf-8',
                );
                const persistedRolle: Rolle<true> = DoFactory.createRolle(true);
                const serviceProviderMocked: ServiceProvider<true> = DoFactory.createServiceProvider(true);

                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced serviceProvider
                serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProviderMocked);

                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockRejectedValueOnce(new EntityNotFoundError());

                rolleRepoMock.save.mockResolvedValueOnce(persistedRolle);
                await expect(dbSeedService.seedRolle(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });

        describe('with non-existing serviceProvider for in serviceProviderIds', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/rolle/06_rolle-with-non-existing-sp.json`,
                    'utf-8',
                );
                const persistedRolle: Rolle<true> = DoFactory.createRolle(true);

                rolleRepoMock.save.mockResolvedValueOnce(persistedRolle);
                await expect(dbSeedService.seedRolle(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });

        describe('should throw error', () => {
            it('should throw NameValidationError if OrganisationFactory.createNew returns DomainError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/rolle/08_rolle-with-invalid-name.json`,
                    'utf-8',
                );
                const persistedRolle: Rolle<true> = DoFactory.createRolle(true);
                const serviceProviderMocked: ServiceProvider<true> = DoFactory.createServiceProvider(true);

                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced serviceProvider
                serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProviderMocked);
                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID of referenced parent
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock get-SSK

                rolleRepoMock.save.mockResolvedValueOnce(persistedRolle);
                await expect(dbSeedService.seedRolle(fileContentAsStr)).rejects.toThrow(
                    NameForRolleWithTrailingSpaceError,
                );
            });
        });
    });

    describe('seedRollenerweiterung', () => {
        function configureValidRollenerweiterungReferences(): {
            organisation: Organisation<true>;
            rolle: Rolle<true>;
            serviceProvider: ServiceProvider<true>;
        } {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);

            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                merkmale: [],
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [],
            });

            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [],
            });

            dbSeedReferenceRepoMock.findUUID
                .mockResolvedValueOnce(organisation.id)
                .mockResolvedValueOnce(rolle.id)
                .mockResolvedValueOnce(serviceProvider.id);

            organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);

            rolleRepoMock.findById.mockResolvedValueOnce(rolle);

            serviceProviderRepoMock.findById.mockResolvedValueOnce(serviceProvider);

            return {
                organisation,
                rolle,
                serviceProvider,
            };
        }

        it('should seed a Rollenerweiterung without creating a seed reference if no seed ID is provided', async () => {
            const fileContentAsStr: string = fs.readFileSync(
                './seeding/seeding-integration-test/rollenerweiterungen/01_rollenerweiterung.json',
                'utf-8',
            );

            // eslint-disable-next-line @typescript-eslint/typedef
            const { organisation, rolle, serviceProvider } = configureValidRollenerweiterungReferences();

            const persistedRollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true, {
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });

            rollenerweiterungServiceMock.create.mockResolvedValueOnce(Ok(persistedRollenerweiterung));

            await expect(dbSeedService.seedRollenerweiterung(fileContentAsStr)).resolves.not.toThrow();
            expect(rollenerweiterungServiceMock.create).toHaveBeenCalledOnce();
            expect(rollenerweiterungServiceMock.create).toHaveBeenCalledWith(organisation, rolle, serviceProvider);
            expect(dbSeedReferenceRepoMock.create).not.toHaveBeenCalled();
        });

        it('should seed a Rollenerweiterung and create a seed reference if a seed ID is provided', async () => {
            const fileContentAsStr: string = fs.readFileSync(
                './seeding/seeding-integration-test/rollenerweiterungen/02_rollenerweiterung-with-id.json',
                'utf-8',
            );

            // eslint-disable-next-line @typescript-eslint/typedef
            const { organisation, rolle, serviceProvider } = configureValidRollenerweiterungReferences();

            const persistedRollenerweiterung: Rollenerweiterung<true> = DoFactory.createRollenerweiterung<true>(true, {
                organisationId: organisation.id,
                rolleId: rolle.id,
                serviceProviderId: serviceProvider.id,
            });

            rollenerweiterungServiceMock.create.mockResolvedValueOnce(Ok(persistedRollenerweiterung));

            dbSeedReferenceRepoMock.create.mockResolvedValueOnce(createDbSeedReference());

            await expect(dbSeedService.seedRollenerweiterung(fileContentAsStr)).resolves.not.toThrow();
            expect(rollenerweiterungServiceMock.create).toHaveBeenCalledOnce();
            expect(rollenerweiterungServiceMock.create).toHaveBeenCalledWith(organisation, rolle, serviceProvider);
            expect(dbSeedReferenceRepoMock.create).toHaveBeenCalledOnce();
            expect(dbSeedReferenceRepoMock.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    referencedEntityType: ReferencedEntityType.ROLLENERWEITERUNG,
                }),
            );
        });

        it('should log and throw if the Rollenerweiterung cannot be created', async () => {
            const fileContentAsStr: string = fs.readFileSync(
                './seeding/seeding-integration-test/rollenerweiterungen/01_rollenerweiterung.json',
                'utf-8',
            );

            const {
                organisation,
                rolle,
                serviceProvider,
            }: {
                organisation: Organisation<true>;
                rolle: Rolle<true>;
                serviceProvider: ServiceProvider<true>;
            } = configureValidRollenerweiterungReferences();

            const createError: CreateRollenerweiterungError = new Error(
                'Could not create Rollenerweiterung',
            ) as CreateRollenerweiterungError;

            rollenerweiterungServiceMock.create.mockResolvedValueOnce(Err(createError));

            await expect(dbSeedService.seedRollenerweiterung(fileContentAsStr)).rejects.toBe(createError);
            expect(rollenerweiterungServiceMock.create).toHaveBeenCalledOnce();
            expect(rollenerweiterungServiceMock.create).toHaveBeenCalledWith(organisation, rolle, serviceProvider);
            expect(dbSeedReferenceRepoMock.create).not.toHaveBeenCalled();
        });
    });

    describe('seedServiceProvider', () => {
        describe('seedServiceProvider with two entities', () => {
            it('should not throw an error', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/serviceProvider/03_service-provider.json`,
                    'utf-8',
                );
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID providedOnSchulstrukturknoten
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock get-SSK

                await expect(dbSeedService.seedServiceProvider(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });

            it('should not throw an error and use the overrideId as id', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/serviceProvider/04_service-provider-with-overrideId.json`,
                    'utf-8',
                );
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID providedOnSchulstrukturknoten
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock get-SSK

                await expect(dbSeedService.seedServiceProvider(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });

        describe('seedServiceProvider with both logo and logoId', () => {
            it('should throw an error', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/serviceProvider/05_service-provider-with-logo-and-logo-id.json`,
                    'utf-8',
                );
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID providedOnSchulstrukturknoten
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock get-SSK

                await expect(dbSeedService.seedServiceProvider(fileContentAsStr)).rejects.toThrow(
                    InvalidLogoCombinationError,
                );
            });
        });
    });

    describe('seedEmailDomain', () => {
        it('should not throw an error', async () => {
            const fileContentAsStr: string = fs.readFileSync(
                `./seeding/seeding-integration-test/emailDomain/01_email-domain.json`,
                'utf-8',
            );
            emailDomainRepoMock.create.mockResolvedValue(
                DoFactory.createEmailDomain<true>(true, { domain: 'test0.com' }),
            );
            dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid());
            dbSeedReferenceRepoMock.create.mockResolvedValue(createDbSeedReference());

            await expect(dbSeedService.seedEmailDomain(fileContentAsStr)).resolves.not.toThrow();
            expect(emailDomainRepoMock.create).toHaveBeenCalledTimes(2);
            expect(dbSeedReferenceRepoMock.create).toHaveBeenCalledTimes(2);
        });

        it('should skip reference if persistedEmailDomain is undefined', async () => {
            const fileContentAsStr: string = fs.readFileSync(
                `./seeding/seeding-integration-test/emailDomain/01_email-domain.json`,
                'utf-8',
            );
            emailDomainRepoMock.create.mockResolvedValueOnce(undefined as unknown as EmailDomain<true>);
            emailDomainRepoMock.create.mockResolvedValueOnce(
                DoFactory.createEmailDomain<true>(true, { domain: 'test2.com' }),
            );

            await dbSeedService.seedEmailDomain(fileContentAsStr);
            expect(dbSeedReferenceRepoMock.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('seedPerson', () => {
        describe('person already exists in keycloak', () => {
            it('should delete the person and then create it again', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/existingPerson/02_person.json`,
                    'utf-8',
                );

                const personNotPersisted: Person<false> = DoFactory.createPerson(false);
                const personPersisted: Person<true> = DoFactory.createPerson(true, {
                    vorname: personNotPersisted.vorname,
                    familienname: personNotPersisted.familienname,
                });
                const existingUser: User<true> = User.construct<true>(
                    faker.string.uuid(),
                    'testusername',
                    'test@example.com',
                    faker.date.recent(),
                    {
                        ID_NEXTCLOUD: [faker.string.uuid()],
                        ID_ITSLEARNING: [faker.string.uuid()],
                    },
                    true,
                );
                personFactory.createNew.mockResolvedValue(personNotPersisted);

                kcUserService.findOne.mockResolvedValueOnce({ ok: true, value: existingUser });
                kcUserService.delete.mockResolvedValueOnce({ ok: true, value: undefined });
                personRepoMock.create.mockResolvedValue(personPersisted);

                await expect(dbSeedService.seedPerson(fileContentAsStr)).resolves.not.toThrow(EntityNotFoundError);
                expect(kcUserService.delete).toHaveBeenCalled();
            });
        });
    });

    describe('seedTechnicalUser', () => {
        describe('no id in seeding', () => {
            it('should not create user', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/invalidPerson/06_technical-user.json`,
                    'utf-8',
                );

                const person: Person<false> = DoFactory.createPerson(false);
                const personPersisted: Person<true> = DoFactory.createPerson(true);
                personFactory.createNew.mockResolvedValueOnce(person);
                personRepoMock.create.mockResolvedValue(personPersisted);

                await dbSeedService.seedTechnicalUser(fileContentAsStr);

                expect(dbSeedReferenceRepoMock.create).toHaveBeenCalledTimes(0);
            });
        });

        describe('error in person factory', () => {
            it('should throw Domain Error', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/invalidPerson/06_technical-user.json`,
                    'utf-8',
                );

                // return DomainError
                personFactory.createNew.mockResolvedValueOnce(new NameForOrganisationWithTrailingSpaceError());

                await expect(dbSeedService.seedTechnicalUser(fileContentAsStr)).rejects.toThrow(
                    NameForOrganisationWithTrailingSpaceError,
                );
                expect(personRepoMock.create).toHaveBeenCalledTimes(0);
                expect(dbSeedReferenceRepoMock.create).toHaveBeenCalledTimes(0);
            });
        });
    });

    describe('seedPersonkontext', () => {
        describe('with violated Personenkontext Klasse specification', () => {
            it('should throw GleicheRolleAnKlasseWieSchuleError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true)); // mock getReferencedPerson

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock getReferencedOrganisation

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                rolleRepoMock.findById.mockResolvedValue(DoFactory.createRolle(true, { merkmale: [] })); // mock getReferencedRolle

                personenkontextServiceMock.checkSpecifications.mockResolvedValueOnce(
                    new GleicheRolleAnKlasseWieSchuleError(),
                );
                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(
                    GleicheRolleAnKlasseWieSchuleError,
                );
            });
        });

        describe('with Rolle with Befristung', () => {
            it('should insert one entity with Befristung', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true)); // mock getReferencedPerson

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock getReferencedOrganisation

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                rolleRepoMock.findById.mockResolvedValue(
                    DoFactory.createRolle(true, { merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT] }),
                ); // mock getReferencedRolle

                personenkontextServiceMock.checkSpecifications.mockResolvedValueOnce(null);

                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });

        describe('with overrideId', () => {
            it('should use the overrideId as id', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/06_personenkontext-with-overrideId.json`,
                    'utf-8',
                );
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true)); // mock getReferencedPerson

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock getReferencedOrganisation

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                rolleRepoMock.findById.mockResolvedValue(
                    DoFactory.createRolle(true, { merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT] }),
                ); // mock getReferencedRolle

                personenkontextServiceMock.checkSpecifications.mockResolvedValueOnce(null);

                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).resolves.not.toThrow(
                    EntityNotFoundError,
                );
            });
        });
    });

    describe('getReferencedPerson', () => {
        describe('when person cannot be found via PersonRepository', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID was found via seeding-ref-table
                personRepoMock.findById.mockResolvedValue(undefined);
                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });
    });

    describe('getReferencedOrganisation', () => {
        describe('when organisation cannot be found via OrganisationRepository', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID for person, found via seeding-ref-table
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true));
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID for orga, found via seeding-ref-table
                organisationRepositoryMock.findById.mockResolvedValue(undefined);

                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });
    });

    describe('getReferencedRolle', () => {
        describe('when rolle cannot be found seeding-ref table', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );

                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID for person, found via seeding-ref-table
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true));
                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(faker.string.uuid()); //mock UUID for orga, found via seeding-ref-table
                organisationRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
                dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(undefined); //mock UUID for rolle, found via seeding-ref-table

                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });
        describe('seedPersonenkontext', () => {
            describe('when person UUID cannot be found', () => {
                it('should throw EntityNotFoundError', async () => {
                    const fileContentAsStr: string = fs.readFileSync(
                        `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                        'utf-8',
                    );

                    // Mock dbSeedReferenceRepo to return undefined for the person UUID
                    dbSeedReferenceRepoMock.findUUID.mockResolvedValueOnce(undefined);

                    await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(
                        EntityNotFoundError,
                    );
                });
            });

            describe('with violated Personenkontext Klasse specification', () => {
                it('should throw GleicheRolleAnKlasseWieSchuleError', async () => {
                    const fileContentAsStr: string = fs.readFileSync(
                        `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                        'utf-8',
                    );
                    dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                    personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true)); // mock getReferencedPerson

                    dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                    organisationRepositoryMock.findById.mockResolvedValue(DoFactory.createOrganisation(true)); // mock getReferencedOrganisation

                    dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID in seeding-ref-table
                    rolleRepoMock.findById.mockResolvedValue(DoFactory.createRolle(true, { merkmale: [] })); // mock getReferencedRolle

                    personenkontextServiceMock.checkSpecifications.mockResolvedValueOnce(
                        new GleicheRolleAnKlasseWieSchuleError(),
                    );
                    await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(
                        GleicheRolleAnKlasseWieSchuleError,
                    );
                });
            });
        });

        describe('when rolle cannot be found via RolleRepository', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/personenkontext/05_personenkontext.json`,
                    'utf-8',
                );

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID for person, found via seeding-ref-table
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true));
                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID for orga, found via seeding-ref-table
                organisationRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID for rolle, found via seeding-ref-table
                rolleRepoMock.findById.mockResolvedValue(undefined);

                await expect(dbSeedService.seedPersonenkontext(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });
    });

    describe('getReferencedServiceProvider', () => {
        describe('when serviceProvider cannot be found via ServiceProviderRepository', () => {
            it('should throw EntityNotFoundError', async () => {
                const fileContentAsStr: string = fs.readFileSync(
                    `./seeding/seeding-integration-test/rolle/06_rolle-with-non-existing-sp.json`,
                    'utf-8',
                );

                dbSeedReferenceRepoMock.findUUID.mockResolvedValue(faker.string.uuid()); //mock UUID for SP was found via seeding-ref-table
                serviceProviderRepoMock.findById.mockResolvedValue(undefined);
                await expect(dbSeedService.seedRolle(fileContentAsStr)).rejects.toThrow(EntityNotFoundError);
            });
        });
    });

    describe('getEntityFileNames', () => {
        describe('getEntityFileNames in directory sql/seeding-integration-test', () => {
            it('should return all files in directory', () => {
                const entityFileNames: string[] = dbSeedService.getEntityFileNames(
                    'seeding-integration-test/all',
                    '01',
                );
                expect(entityFileNames).toHaveLength(9);
            });
        });
    });
});
