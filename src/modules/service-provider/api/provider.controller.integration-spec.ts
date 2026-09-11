import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';

import {
    createAuthInterceptorMock,
    createOidcClientMock,
    createPersonPermissionsMock,
} from '../../../../test/utils/auth.mock.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../shared/filter/validation-exception-filter.js';
import { PagedResponse } from '../../../shared/paging/index.js';
import { RawPagedResponse } from '../../../shared/paging/raw-paged.response.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { AuthenticationExceptionFilter } from '../../authentication/api/authentication-exception-filter.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OIDC_CLIENT } from '../../authentication/services/oidc-client.service.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderKategorie, ServiceProviderMerkmal } from '../domain/service-provider.enum.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { mapEntityToAggregate } from '../repo/service-provider-entity-mapper.js';
import { ServiceProviderEntity } from '../repo/service-provider.entity.js';
import { ServiceProviderApiModule } from '../service-provider-api.module.js';
import { CreateServiceProviderBodyParams } from './create-service-provider-body.params.js';
import { CreateServiceProviderResponse } from './create-service-provider.response.js';
import { FindServiceProviderForRolleQueryParams } from './find-service-provider-for-rolle-query.params.js';
import { ManageableLandRootServiceProvidersQueryParams } from './manageable-land-root-service-providers-query.params.js';
import { ManageableServiceProviderListEntryResponse } from './manageable-service-provider-list-entry.response.js';
import { ManageableServiceProviderSimpleListEntryResponse } from './manageable-service-provider-simple-list-entry.response.js';
import { ManageableServiceProviderResponse } from './manageable-service-provider.response.js';
import { ManageableServiceProvidersParams } from './manageable-service-providers.params.js';
import { RollenerweiterungForManageableServiceProviderResponse } from './RollenerweiterungForManageableServiceProviderResponse.js';
import { ServiceProviderResponse } from './service-provider.response.js';
import { UpdateServiceProviderBodyParams } from './update-service-provider-body.params.js';

describe('ServiceProvider API', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let em: EntityManager;
    let rolleRepo: RolleRepo;
    let rollenerweiterungRepo: RollenerweiterungRepo;
    let organisationRepo: OrganisationRepository;

    let permissionsMock: DeepMocked<PersonPermissions>;

    beforeAll(async () => {
        permissionsMock = createPersonPermissionsMock();

        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ServiceProviderApiModule,
                CommonTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
            ],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: OIDC_CLIENT,
                    useValue: createOidcClientMock(),
                },
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
                {
                    provide: APP_INTERCEPTOR,
                    useValue: createAuthInterceptorMock(permissionsMock),
                },
                { provide: APP_FILTER, useClass: ValidationExceptionFilter },
                { provide: APP_FILTER, useClass: AuthenticationExceptionFilter },
                { provide: APP_FILTER, useClass: SharedExceptionFilter },
            ],
        }).compile();

        const stepUpGuard: StepUpGuard = module.get(StepUpGuard);
        stepUpGuard.canActivate = vi.fn().mockReturnValue(true);

        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        rolleRepo = module.get(RolleRepo);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);
        organisationRepo = module.get(OrganisationRepository);

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
        vi.restoreAllMocks();
        permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
    });

    describe('/GET provider/assignable-for-rolle', () => {
        const url: string = '/provider/assignable-for-rolle';

        it('should return all service providers for a specific organisation', async () => {
            const parent: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const orga: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { administriertVon: parent.id }),
            );
            const child: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { administriertVon: orga.id }),
            );
            const serviceProviders: ServiceProvider<true>[] = await Promise.all([
                createAndPersistServiceProvider(em, { providedOnSchulstrukturknoten: parent.id }),
                createAndPersistServiceProvider(em, { providedOnSchulstrukturknoten: orga.id }),
                createAndPersistServiceProvider(em, { providedOnSchulstrukturknoten: child.id }),
                createAndPersistServiceProvider(em),
            ]);
            const query: FindServiceProviderForRolleQueryParams = {
                schulstrukturknotenOfRolle: orga.id,
            };

            const response: Response = await request(app.getHttpServer() as App)
                .get(url)
                .query(query)
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Array);
            expect(response.body).toHaveLength(2);
            expect(response.body).toContainEqual(new ServiceProviderResponse(serviceProviders[0]!));
            expect(response.body).toContainEqual(new ServiceProviderResponse(serviceProviders[1]!));
        });

        it('should return 404 if permissions are missing', async () => {
            const schulstrukturknotenOfRolle: string = faker.string.uuid();
            const query: FindServiceProviderForRolleQueryParams = {
                schulstrukturknotenOfRolle,
            };
            permissionsMock.hasSystemrechteAtOrganisation.mockClear();
            permissionsMock.hasSystemrechteAtOrganisation.mockResolvedValueOnce(false);

            const response: Response = await request(app.getHttpServer() as App)
                .get(url)
                .query(query)
                .send();

            expect(response.status).toBe(404);
            expect(response.body).toEqual(expect.objectContaining({ i18nKey: 'MISSING_PERMISSIONS' }));
            expect(permissionsMock.hasSystemrechteAtOrganisation).toHaveBeenCalledWith(schulstrukturknotenOfRolle, [
                RollenSystemRecht.ROLLEN_VERWALTEN,
            ]);
        });
    });

    describe('/GET getAvailableServiceProviders', () => {
        it('should return if orga and systemrecht are provided', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                all: false,
                orgaIds: [organisation.id],
            });

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider')
                .query({
                    organisationId: organisation.id,
                    systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN],
                })
                .expect(200);

            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<ServiceProviderResponse> =
                response.body as PagedResponse<ServiceProviderResponse>;
            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items).toContainEqual(expect.objectContaining({ id: serviceProvider.id }));
        });

        it('should return empty result if organisationId is missing', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider')
                .query({
                    systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN],
                })
                .expect(200);

            const pagedResponse: PagedResponse<ServiceProviderResponse> =
                response.body as PagedResponse<ServiceProviderResponse>;
            expect(pagedResponse.items).toHaveLength(0);
        });

        it('should return empty result if another systemrecht is provided', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider')
                .query({
                    organisationId: organisation.id,
                    systemrechte: [RollenSystemRechtEnum.ANGEBOTE_VERWALTEN],
                });
            expect(response.status).toBe(400);
        });
    });

    describe('/GET logo', () => {
        describe('when the service provider exists and has a logo', () => {
            it('should return the image file', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/provider/${serviceProvider.id}/logo`)
                    .send();

                expect(response.status).toBe(200);
                expect(response.body).toBeInstanceOf(Buffer);
            });
        });

        describe('when the service provider exists but does not have a logo', () => {
            it('should return 404', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    logo: undefined,
                    logoMimeType: undefined,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/provider/${serviceProvider.id}/logo`)
                    .send();

                expect(response.status).toBe(404);
            });
        });

        describe('when the service provider does not exist', () => {
            it('should return 404', async () => {
                const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);

                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/provider/${serviceProvider.id}/logo`)
                    .send();

                expect(response.status).toBe(404);
            });
        });
    });

    describe('/GET manageable service providers', () => {
        it('should return manageable service providers with linked objects', async () => {
            // Arrange: create organisation, rolle, and service providers
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const serviceProvider1: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
            });
            const serviceProvider2: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
            });

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    serviceProviderIds: [serviceProvider1.id],
                }),
            );
            if (rolle instanceof DomainError) {
                throw rolle;
            }

            const params: ManageableServiceProvidersParams = new ManageableServiceProvidersParams();
            Object.assign(params, { limit: 10, offset: 0 });
            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider/manageable')
                .query(params)
                .send();

            const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;
            expect(response.status).toBe(200);
            expect(body.items).toBeInstanceOf(Array);
            expect(body.items.length).toBeGreaterThanOrEqual(2);
            expect(body.limit).toBe(params.limit);
            expect(body.offset).toBe(params.offset);
            expect(body.total).toBe(2);

            [serviceProvider1, serviceProvider2].forEach((sp: ServiceProvider<true>) => {
                const entry: ManageableServiceProviderSimpleListEntryResponse | undefined = body.items.find(
                    (e: ManageableServiceProviderSimpleListEntryResponse) => e.id === sp.id,
                );

                expect(entry).toBeDefined();
                expect(entry?.id).toBe(sp.id);
                expect(entry?.name).toBe(sp.name);
                expect(entry?.administrationsebene.id).toBe(organisation.id);
                expect(entry?.administrationsebene.name).toBe(organisation.name);
                expect(entry?.administrationsebene.kennung).toBe(organisation.kennung);
                expect(entry?.kategorie).toBe(sp.kategorie);
                expect(entry?.requires2fa).toBe(sp.requires2fa);
                expect(entry?.merkmale).toEqual(expect.arrayContaining(serviceProvider1.merkmale));
                expect(entry?.rollenartenWhitelist).toEqual(sp.rollenartenWhitelist);
                expect(entry?.hasRollenerweiterungen).toBe(false);
                expect(entry?.rollen).toBeInstanceOf(Array);
                if (rolle.serviceProviderIds.includes(sp.id)) {
                    expect(entry?.rollen.length).toBe(1);
                    expect(entry?.rollen[0]!.id).toBe(rolle.id);
                    expect(entry?.rollen[0]!.name).toBe(rolle.name);
                } else {
                    expect(entry?.rollen.length).toBe(0);
                }
            });
        });

        it('should return only service providers matching the kategorien filter', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const emailServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                kategorie: ServiceProviderKategorie.EMAIL,
                providedOnSchulstrukturknoten: organisation.id,
            });
            const unterrichtServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                kategorie: ServiceProviderKategorie.UNTERRICHT,
                providedOnSchulstrukturknoten: organisation.id,
            });
            await createAndPersistServiceProvider(em, {
                kategorie: ServiceProviderKategorie.VERWALTUNG,
                providedOnSchulstrukturknoten: organisation.id,
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider/manageable')
                .query({ kategorien: [ServiceProviderKategorie.EMAIL, ServiceProviderKategorie.UNTERRICHT] })
                .send();

            const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

            expect(response.status).toBe(200);
            expect(body.total).toBe(2);

            const sortedManageableServiceProviderIds: string[] = body.items
                .map((item: ManageableServiceProviderSimpleListEntryResponse) => item.id)
                .sort();
            expect(sortedManageableServiceProviderIds).toEqual(
                [emailServiceProvider.id, unterrichtServiceProvider.id].sort(),
            );
        });

        it('should return all service providers when filtering by every kategorie', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const allKategorien: ServiceProviderKategorie[] = Object.values(ServiceProviderKategorie);
            const serviceProviders: ServiceProvider<true>[] = await Promise.all(
                allKategorien.map((kategorie: ServiceProviderKategorie) =>
                    createAndPersistServiceProvider(em, {
                        kategorie,
                        providedOnSchulstrukturknoten: organisation.id,
                    }),
                ),
            );

            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider/manageable')
                .query({ kategorien: allKategorien })
                .send();

            const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

            expect(response.status).toBe(200);
            expect(body.total).toBe(serviceProviders.length);

            const sortedManageableServiceProviderIds: string[] = body.items
                .map((item: ManageableServiceProviderSimpleListEntryResponse) => item.id)
                .sort();
            expect(sortedManageableServiceProviderIds).toEqual(
                serviceProviders.map((sp: ServiceProvider<true>) => sp.id).sort(),
            );
        });

        it('should return no service providers when none match the kategorien filter', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            await createAndPersistServiceProvider(em, {
                kategorie: ServiceProviderKategorie.VERWALTUNG,
                providedOnSchulstrukturknoten: organisation.id,
            });
            await createAndPersistServiceProvider(em, {
                kategorie: ServiceProviderKategorie.HINWEISE,
                providedOnSchulstrukturknoten: organisation.id,
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider/manageable')
                .query({ kategorien: [ServiceProviderKategorie.EMAIL] })
                .send();

            const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

            expect(response.status).toBe(200);
            expect(body.total).toBe(0);
            expect(body.items).toHaveLength(0);
        });

        it('should return 400 for an invalid kategorie value', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider/manageable')
                .query({ kategorien: ['NOT_A_VALID_KATEGORIE'] })
                .send();

            expect(response.status).toBe(400);
        });

        describe('when searchFilter is provided', () => {
            it('should return only service providers matching the searchFilter case-insensitively', async () => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const matchingServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    name: 'Alpha Angebot',
                    providedOnSchulstrukturknoten: organisation.id,
                });
                await createAndPersistServiceProvider(em, {
                    name: 'Beta Angebot',
                    providedOnSchulstrukturknoten: organisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get('/provider/manageable')
                    .query({ searchFilter: 'alpha' })
                    .send();

                const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

                expect(response.status).toBe(200);
                expect(body.total).toBe(1);
                expect(body.items).toHaveLength(1);
                expect(body.items[0]?.id).toBe(matchingServiceProvider.id);
            });

            it('should return service providers matching a substring of the name', async () => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const matchingServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    name: 'Gamma Portal',
                    providedOnSchulstrukturknoten: organisation.id,
                });
                await createAndPersistServiceProvider(em, {
                    name: 'Delta Portal',
                    providedOnSchulstrukturknoten: organisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get('/provider/manageable')
                    .query({ searchFilter: 'Gamma' })
                    .send();

                const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

                expect(response.status).toBe(200);
                expect(body.total).toBe(1);
                expect(body.items).toHaveLength(1);
                expect(body.items[0]?.id).toBe(matchingServiceProvider.id);
            });

            it('should combine the searchFilter with the kategorien filter', async () => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const matchingServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    name: 'Alpha Angebot',
                    kategorie: ServiceProviderKategorie.EMAIL,
                    providedOnSchulstrukturknoten: organisation.id,
                });
                await createAndPersistServiceProvider(em, {
                    name: 'Alpha Angebot',
                    kategorie: ServiceProviderKategorie.UNTERRICHT,
                    providedOnSchulstrukturknoten: organisation.id,
                });
                await createAndPersistServiceProvider(em, {
                    name: 'Beta Angebot',
                    kategorie: ServiceProviderKategorie.EMAIL,
                    providedOnSchulstrukturknoten: organisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get('/provider/manageable')
                    .query({ searchFilter: 'alpha', kategorien: [ServiceProviderKategorie.EMAIL] })
                    .send();

                const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

                expect(response.status).toBe(200);
                expect(body.total).toBe(1);
                expect(body.items).toHaveLength(1);
                expect(body.items[0]?.id).toBe(matchingServiceProvider.id);
            });

            it('should return no service providers when the searchFilter matches no name', async () => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                await createAndPersistServiceProvider(em, {
                    name: 'Alpha Angebot',
                    providedOnSchulstrukturknoten: organisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get('/provider/manageable')
                    .query({ searchFilter: 'nonexistent' })
                    .send();

                const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

                expect(response.status).toBe(200);
                expect(body.total).toBe(0);
                expect(body.items).toHaveLength(0);
            });

            it('should treat "_" in the searchFilter literally instead of as a wildcard', async () => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const matchingServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    name: 'A_B',
                    providedOnSchulstrukturknoten: organisation.id,
                });
                await createAndPersistServiceProvider(em, {
                    name: 'AXB',
                    providedOnSchulstrukturknoten: organisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get('/provider/manageable')
                    .query({ searchFilter: 'A_B' })
                    .send();

                const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

                expect(response.status).toBe(200);
                expect(body.total).toBe(1);
                expect(body.items).toHaveLength(1);
                expect(body.items[0]?.id).toBe(matchingServiceProvider.id);
            });

            it('should treat "%" in the searchFilter literally instead of as a wildcard', async () => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const matchingServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    name: '50% Rabatt',
                    providedOnSchulstrukturknoten: organisation.id,
                });
                await createAndPersistServiceProvider(em, {
                    name: '50 Cent',
                    providedOnSchulstrukturknoten: organisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get('/provider/manageable')
                    .query({ searchFilter: '50%' })
                    .send();

                const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

                expect(response.status).toBe(200);
                expect(body.total).toBe(1);
                expect(body.items).toHaveLength(1);
                expect(body.items[0]?.id).toBe(matchingServiceProvider.id);
            });

            it('should treat "\\" in the searchFilter literally instead of as an escape character', async () => {
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const matchingServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    name: 'C:\\Temp',
                    providedOnSchulstrukturknoten: organisation.id,
                });
                await createAndPersistServiceProvider(em, {
                    name: 'C:Temp',
                    providedOnSchulstrukturknoten: organisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get('/provider/manageable')
                    .query({ searchFilter: 'C:\\Temp' })
                    .send();

                const body: RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse> =
                    response.body as RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>;

                expect(response.status).toBe(200);
                expect(body.total).toBe(1);
                expect(body.items).toHaveLength(1);
                expect(body.items[0]?.id).toBe(matchingServiceProvider.id);
            });
        });
    });

    describe('/GET manageable service providers for organisation', () => {
        let organisation: Organisation<true>;
        let serviceProvider: ServiceProvider<true>;
        let rolle: Rolle<true>;
        let rolle2: Rolle<true>;
        let rolleWithErweiterung: Rolle<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            serviceProvider = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
            });
            const rolleError: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    serviceProviderIds: [serviceProvider.id],
                }),
            );
            if (rolleError instanceof DomainError) {
                throw rolleError;
            }
            rolle = rolleError;
            const rolle2Error: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    serviceProviderIds: [],
                }),
            );
            if (rolle2Error instanceof DomainError) {
                throw rolle2Error;
            }
            rolle2 = rolle2Error;
            const rolleWithErweiterungError: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                }),
            );
            if (rolleWithErweiterungError instanceof DomainError) {
                throw rolleWithErweiterungError;
            }
            rolleWithErweiterung = rolleWithErweiterungError;
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: organisation.id,
                    rolleId: rolleWithErweiterung.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: organisation.id,
                    rolleId: rolle2.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should return manageable service providers for organisation', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider/manageable-by-organisation')
                .query({ organisationId: organisation.id })
                .send();

            const body: RawPagedResponse<ManageableServiceProviderListEntryResponse> =
                response.body as RawPagedResponse<ManageableServiceProviderListEntryResponse>;
            expect(response.status).toBe(200);

            expect(body).toEqual<RawPagedResponse<ManageableServiceProviderListEntryResponse>>({
                items: [
                    {
                        id: serviceProvider.id,
                        name: serviceProvider.name,
                        administrationsebene: {
                            id: organisation.id,
                            name: organisation.name!,
                            kennung: organisation.kennung!,
                        },
                        kategorie: serviceProvider.kategorie,
                        requires2fa: serviceProvider.requires2fa,
                        merkmale: serviceProvider.merkmale,
                        rollenartenWhitelist: serviceProvider.rollenartenWhitelist,
                        rollenerweiterungen:
                            expect.arrayContaining<RollenerweiterungForManageableServiceProviderResponse>([
                                {
                                    organisation: {
                                        id: organisation.id,
                                        name: organisation.name!,
                                        kennung: organisation.kennung!,
                                    },
                                    rolle: {
                                        id: rolleWithErweiterung.id,
                                        name: rolleWithErweiterung.name,
                                    },
                                },
                                {
                                    organisation: {
                                        id: organisation.id,
                                        name: organisation.name!,
                                        kennung: organisation.kennung!,
                                    },
                                    rolle: {
                                        id: rolle2.id,
                                        name: rolle2.name,
                                    },
                                },
                            ]) as RollenerweiterungForManageableServiceProviderResponse[],
                        rollen: [
                            {
                                id: rolle.id,
                                name: rolle.name,
                            },
                        ],
                        hasSomeVerwaltenPermission: true,
                    },
                ],
                limit: 1,
                offset: 0,
                total: 1,
            });
        });

        it('should return empty list', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get('/provider/manageable-by-organisation')
                .query({ organisationId: faker.string.uuid() })
                .send();

            const body: RawPagedResponse<ManageableServiceProviderListEntryResponse> =
                response.body as RawPagedResponse<ManageableServiceProviderListEntryResponse>;
            expect(response.status).toBe(200);

            expect(body).toEqual<RawPagedResponse<ManageableServiceProviderListEntryResponse>>({
                items: [],
                limit: 0,
                offset: 0,
                total: 0,
            });
        });
    });

    describe('/GET manageable service provider by id', () => {
        let organisation: Organisation<true>;
        let serviceProvider: ServiceProvider<true>;
        let rolle: Rolle<true>;
        let rolleWithErweiterung: Rolle<true>;

        beforeEach(async () => {
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            serviceProvider = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
            });
            rolle = (await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    serviceProviderIds: [serviceProvider.id],
                }),
            )) as Rolle<true>;
            if (rolle instanceof DomainError) {
                throw rolle;
            }
            rolleWithErweiterung = (await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                }),
            )) as Rolle<true>;
            if (rolleWithErweiterung instanceof DomainError) {
                throw rolleWithErweiterung;
            }
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: organisation.id,
                    rolleId: rolleWithErweiterung.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );
        });

        it('should return manageable service provider', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get(`/provider/manageable/${serviceProvider.id}`)
                .send();

            const body: ManageableServiceProviderResponse = response.body as ManageableServiceProviderResponse;
            expect(response.status).toBe(200);

            expect(body).toEqual({
                id: serviceProvider.id,
                name: serviceProvider.name,
                administrationsebene: {
                    id: organisation.id,
                    name: organisation.name!,
                    kennung: organisation.kennung!,
                },
                kategorie: serviceProvider.kategorie,
                logoId: undefined,
                requires2fa: serviceProvider.requires2fa,
                merkmale: serviceProvider.merkmale,
                rollenartenWhitelist: serviceProvider.rollenartenWhitelist,
                url: serviceProvider.url,
                hasRollenerweiterung: true,
                availableForRollenerweiterung: false,
                rollen: [
                    {
                        id: rolle.id,
                        name: rolle.name,
                    },
                ],
                relevantSystemrechte: [
                    RollenSystemRechtEnum.ANGEBOTE_VERWALTEN,
                    RollenSystemRechtEnum.ANGEBOTE_EINGESCHRAENKT_VERWALTEN,
                    RollenSystemRechtEnum.ROLLEN_ERWEITERN,
                ],
            });
        });

        it('should return 404 if service provider is not found', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get(`/provider/manageable/${faker.string.uuid()}`)
                .send();

            expect(response.status).toBe(404);
        });
    });

    describe('/PATCH update service provider', () => {
        let organisation: Organisation<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
        });

        describe('when service provider has a logo', () => {
            it('should update service provider, but keep logo and logoMimeType set', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: organisation.id,
                });
                const body: UpdateServiceProviderBodyParams = {
                    name: 'Updated Service Provider Name',
                    url: 'https://updated-url.com',
                    kategorie: faker.helpers.enumValue(ServiceProviderKategorie),
                    logoId: null,
                };

                const response: Response = await request(app.getHttpServer() as App)
                    .patch(`/provider/${serviceProvider.id}`)
                    .send(body);

                expect(response.status).toBe(200);
                const updatedServiceProvider: ServiceProviderEntity = await em.findOneOrFail(
                    ServiceProviderEntity,
                    { id: serviceProvider.id },
                    { refresh: true },
                );
                expect(updatedServiceProvider.logoId).toBeUndefined();
                expect(updatedServiceProvider.logo).toEqual(serviceProvider.logo);
                expect(updatedServiceProvider.logoMimeType).toBe(serviceProvider.logoMimeType);
            });

            it('should reject updates for VIDIS-linked service providers', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: organisation.id,
                    vidisAngebotId: faker.string.uuid(),
                });
                const body: UpdateServiceProviderBodyParams = {
                    name: 'Updated Service Provider Name',
                };

                const response: Response = await request(app.getHttpServer() as App)
                    .patch(`/provider/${serviceProvider.id}`)
                    .send(body);

                expect(response.status).toBe(400);
                expect(response.body).toEqual(expect.objectContaining({ i18nKey: 'VIDIS_SERVICE_PROVIDER_IMMUTABLE' }));

                const storedServiceProvider: ServiceProviderEntity = await em.findOneOrFail(
                    ServiceProviderEntity,
                    { id: serviceProvider.id },
                    { refresh: true },
                );
                expect(storedServiceProvider.name).toBe(serviceProvider.name);
                expect(storedServiceProvider.vidisAngebotId).toBe(serviceProvider.vidisAngebotId);
            });

            it('should reject updates to logoId', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: organisation.id,
                });
                const body: UpdateServiceProviderBodyParams = {
                    logoId: 1,
                };

                const response: Response = await request(app.getHttpServer() as App)
                    .patch(`/provider/${serviceProvider.id}`)
                    .send(body);

                expect(response.status).toBe(400);
                const storedServiceProvider: ServiceProviderEntity = await em.findOneOrFail(
                    ServiceProviderEntity,
                    { id: serviceProvider.id },
                    { refresh: true },
                );
                expect(storedServiceProvider.logoId).toBeUndefined();
                expect(storedServiceProvider.logo).toEqual(serviceProvider.logo);
                expect(storedServiceProvider.logoMimeType).toBe(serviceProvider.logoMimeType);
            });
        });

        describe('when service provider has no logo', () => {
            it('should update service provider with logoId', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: organisation.id,
                    logo: undefined,
                    logoMimeType: undefined,
                });
                const body: UpdateServiceProviderBodyParams = {
                    name: 'Updated Service Provider Name',
                    url: 'https://updated-url.com',
                    kategorie: faker.helpers.enumValue(ServiceProviderKategorie),
                    logoId: 1,
                };
                const response: Response = await request(app.getHttpServer() as App)
                    .patch(`/provider/${serviceProvider.id}`)
                    .send(body);

                expect(response.status).toBe(200);
                expect(response.body).toEqual(
                    expect.objectContaining({
                        name: body.name,
                        url: body.url,
                        kategorie: body.kategorie,
                        logoId: body.logoId,
                    }),
                );

                const updatedServiceProvider: ServiceProviderEntity = await em.findOneOrFail(
                    ServiceProviderEntity,
                    { id: serviceProvider.id },
                    { refresh: true },
                );
                expect(mapEntityToAggregate(updatedServiceProvider)).toEqual(
                    expect.objectContaining({
                        ...serviceProvider,
                        ...body,
                        logo: undefined,
                        logoMimeType: undefined,
                        keycloakGroup: undefined,
                        keycloakRole: undefined,
                        updatedAt: updatedServiceProvider.updatedAt,
                        vidisAngebotId: undefined,
                    }),
                );
            });
        });
    });

    describe('/POST create service provider', () => {
        it('should return created service provider in expected response shape', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const body: CreateServiceProviderBodyParams = {
                organisationId: organisation.id,
                name: faker.company.name(),
                url: faker.internet.url(),
                kategorie: faker.helpers.enumValue(ServiceProviderKategorie),
                rollenartenWhitelist: [RollenArt.LEHR],
                requires2fa: faker.datatype.boolean(),
                merkmale: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/provider')
                .send(body);
            const responseBody: CreateServiceProviderResponse = response.body as CreateServiceProviderResponse;

            expect(response.status).toBe(201);
            expect(responseBody).toEqual({
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                id: expect.any(String),
                name: body.name,
                target: 'URL',
                url: body.url,
                kategorie: body.kategorie,
                hasLogo: false,
                rollenartenWhitelist: body.rollenartenWhitelist,
                requires2fa: body.requires2fa,
                merkmale: body.merkmale,
            });

            const persistedServiceProvider: ServiceProviderEntity = await em.findOneOrFail(
                ServiceProviderEntity,
                { id: responseBody.id },
                { refresh: true },
            );
            expect(persistedServiceProvider).toEqual(
                expect.objectContaining({
                    id: responseBody.id,
                    name: body.name,
                    target: 'URL',
                    url: body.url,
                    kategorie: body.kategorie,
                    providedOnSchulstrukturknoten: organisation.id,
                    requires2fa: body.requires2fa,
                }),
            );
            expect(persistedServiceProvider.merkmale).toHaveLength(0);
        });
    });

    describe('/DELETE service provider by id', () => {
        let organisation: Organisation<true>;
        let serviceProvider: ServiceProvider<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(DoFactory.createOrganisation(false));
            serviceProvider = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
            });
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
        });

        it('should delete service provider', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .delete(`/provider/${serviceProvider.id}`)
                .send();

            expect(response.status).toBe(204);
            expect(await em.findOne(ServiceProviderEntity, { id: serviceProvider.id }, { refresh: true })).toBeNull();
        });

        it('should return 404 if service provider is not found', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .delete(`/provider/${faker.string.uuid()}`)
                .send();

            expect(response.status).toBe(404);
            expect(response.body).toEqual(expect.objectContaining({ i18nKey: 'ENTITY_NOT_FOUND' }));
        });

        it('should return 400 if there are rollen with service provider', async () => {
            await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    serviceProviderIds: [serviceProvider.id],
                }),
            );
            const response: Response = await request(app.getHttpServer() as App)
                .delete(`/provider/${serviceProvider.id}`)
                .send();

            expect(response.status).toBe(409);
            expect(response.body).toEqual(expect.objectContaining({ i18nKey: 'ATTACHED_ROLLEN' }));
        });

        it('should return 400 if there are rollenerweiterungen with service provider', async () => {
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                }),
            );
            if (rolle instanceof DomainError) {
                throw rolle;
            }
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider.id,
                }),
            );

            const response: Response = await request(app.getHttpServer() as App)
                .delete(`/provider/${serviceProvider.id}`)
                .send();

            expect(response.status).toBe(409);
            expect(response.body).toEqual(expect.objectContaining({ i18nKey: 'ATTACHED_ROLLENERWEITERUNGEN' }));
        });

        it('should return 400 if service provider is linked to VIDIS', async () => {
            const vidisLinkedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
                vidisAngebotId: faker.string.uuid(),
            });

            const response: Response = await request(app.getHttpServer() as App)
                .delete(`/provider/${vidisLinkedServiceProvider.id}`)
                .send();

            expect(response.status).toBe(400);
            expect(response.body).toEqual(expect.objectContaining({ i18nKey: 'VIDIS_SERVICE_PROVIDER_IMMUTABLE' }));
            expect(
                await em.findOne(ServiceProviderEntity, { id: vidisLinkedServiceProvider.id }, { refresh: true }),
            ).not.toBeNull();
        });

        it('should return 404 if permissions are missing', async () => {
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            const response: Response = await request(app.getHttpServer() as App)
                .delete(`/provider/${serviceProvider.id}`)
                .send();

            expect(response.status).toBe(404);
            expect(response.body).toEqual(expect.objectContaining({ i18nKey: 'MISSING_PERMISSIONS' }));
        });
    });

    describe('/GET provider/manageable-land-root', () => {
        const url: string = '/provider/manageable-land-root';

        describe('when user has permission', () => {
            const setup = async (): Promise<{
                landOrganisation: Organisation<true>;
                serviceProviders: ServiceProvider<true>[];
            }> => {
                const landOrganisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND }),
                );
                const serviceProviders: ServiceProvider<true>[] = await Promise.all([
                    createAndPersistServiceProvider(em, {
                        providedOnSchulstrukturknoten: landOrganisation.id,
                        name: 'A Provider',
                    }),
                    createAndPersistServiceProvider(em, {
                        providedOnSchulstrukturknoten: landOrganisation.id,
                        name: 'B Provider',
                    }),
                    createAndPersistServiceProvider(em, {
                        providedOnSchulstrukturknoten: landOrganisation.id,
                        name: 'C Provider',
                    }),
                ]);
                return { landOrganisation, serviceProviders };
            };

            it('should return service providers for LAND and ROOT organisations', async () => {
                const { serviceProviders: landServiceProviders }: { serviceProviders: ServiceProvider<true>[] } =
                    await setup();

                const rootOrganisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.ROOT }),
                );
                const rootServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: rootOrganisation.id,
                });

                const schuleOrganisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                );
                const schuleServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: schuleOrganisation.id,
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get(url)
                    .send();

                const body: RawPagedResponse<ServiceProviderResponse> =
                    response.body as RawPagedResponse<ServiceProviderResponse>;
                expect(response.status).toBe(200);
                expect(body.total).toBe(4);
                expect(body.items.map((item: ServiceProviderResponse) => item.id)).toEqual(
                    expect.arrayContaining([
                        ...landServiceProviders.map((sp: ServiceProvider<true>) => sp.id),
                        rootServiceProvider.id,
                    ]),
                );
                expect(body.items.map((item: ServiceProviderResponse) => item.id)).not.toContain(
                    schuleServiceProvider.id,
                );
            });

            it('should filter by searchStr', async () => {
                const { landOrganisation }: { landOrganisation: Organisation<true> } = await setup();
                const matchingServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                    providedOnSchulstrukturknoten: landOrganisation.id,
                    name: 'Matching Provider',
                });

                const params: ManageableLandRootServiceProvidersQueryParams = { searchStr: 'Matching' };
                const response: Response = await request(app.getHttpServer() as App)
                    .get(url)
                    .query(params)
                    .send();

                const body: RawPagedResponse<ServiceProviderResponse> =
                    response.body as RawPagedResponse<ServiceProviderResponse>;
                expect(response.status).toBe(200);
                expect(body.total).toBe(1);
                expect(body.items[0]!.id).toBe(matchingServiceProvider.id);
            });

            it('should respect limit and return correct pageTotal', async () => {
                await setup();

                const params: ManageableLandRootServiceProvidersQueryParams = { limit: 2, offset: 0 };
                const response: Response = await request(app.getHttpServer() as App)
                    .get(url)
                    .query(params)
                    .send();

                const body: RawPagedResponse<ServiceProviderResponse> =
                    response.body as RawPagedResponse<ServiceProviderResponse>;
                expect(response.status).toBe(200);
                expect(body.total).toBe(3);
                expect(body.limit).toBe(2);
                expect(body.offset).toBe(0);
                expect(body.items).toHaveLength(2);
            });

            it('should return the correct page when offset is applied', async () => {
                const {
                    serviceProviders: [, , thirdServiceProvider],
                }: { serviceProviders: ServiceProvider<true>[] } = await setup();

                const params: ManageableLandRootServiceProvidersQueryParams = { limit: 1, offset: 2 };
                const response: Response = await request(app.getHttpServer() as App)
                    .get(url)
                    .query(params)
                    .send();

                const body: RawPagedResponse<ServiceProviderResponse> =
                    response.body as RawPagedResponse<ServiceProviderResponse>;
                expect(response.status).toBe(200);
                expect(body.total).toBe(3);
                expect(body.offset).toBe(2);
                expect(body.items).toHaveLength(1);
                expect(body.items[0]!.id).toBe(thirdServiceProvider!.id);
            });
        });

        describe('when user does not have permission', () => {
            it('should return 404', async () => {
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [faker.string.uuid()],
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .get(url)
                    .send();

                expect(response.status).toBe(404);
            });
        });
    });
});
