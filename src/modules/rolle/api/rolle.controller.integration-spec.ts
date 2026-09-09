import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { CallHandler, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { Observable } from 'rxjs';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';

import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    CommonTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
    KeycloakConfigTestModule,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../shared/filter/validation-exception-filter.js';
import { PagedResponse } from '../../../shared/paging/index.js';
import { generatePassword } from '../../../shared/util/password-generator.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { AuthenticationExceptionFilter } from '../../authentication/api/authentication-exception-filter.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import {
    PersonenkontextRolleWithOrganisation,
    PersonPermissions,
} from '../../authentication/domain/person-permissions.js';
import { PassportUser } from '../../authentication/types/user.js';
import { KeycloakUserService } from '../../keycloak-administration/domain/keycloak-user.service.js';
import { KeycloakConfigModule } from '../../keycloak-administration/keycloak-config.module.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonFactory } from '../../person/domain/person.factory.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { DBiamPersonenkontextRepoInternal } from '../../personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { ServiceProviderResponse } from '../../service-provider/api/service-provider.response.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { RollenArt, RollenMerkmal } from '../domain/rolle.enums.js';
import { Rolle } from '../domain/rolle.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { RolleEntity } from '../entity/rolle.entity.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../repo/rollenerweiterung.repo.js';
import { RolleApiModule } from '../rolle-api.module.js';
import { CreateRolleBodyParams } from './create-rolle.body.params.js';
import { DbiamRolleError } from './dbiam-rolle.error.js';
import { ErrorIdType } from './ErrorIdType.enum.js';
import { FindRollenQueryParams } from './find-rollen-query.params.js';
import { RolleWithServiceProvidersResponse } from './rolle-with-serviceprovider.response.js';
import { RolleResponse } from './rolle.response.js';
import { ServiceProviderIdNameResponse } from './serviceprovider-id-name.response.js';
import { SystemRechtResponse } from './systemrecht.response.js';
import { UpdateRolleBodyParams } from './update-rolle.body.params.js';

describe('Rolle API', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let em: EntityManager;
    let rolleRepo: RolleRepo;
    let rollenerweiterungRepo: RollenerweiterungRepo;
    let personRepo: PersonRepository;
    let organisationRepo: OrganisationRepository;
    let dBiamPersonenkontextRepoInternal: DBiamPersonenkontextRepoInternal;
    let personpermissionsRepoMock: DeepMocked<PersonPermissionsRepo>;
    let personFactory: PersonFactory;
    let permissionsMock: DeepMocked<PersonPermissions>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                RolleApiModule,
                LoggingTestModule,
                CommonTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
            ],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: APP_INTERCEPTOR,
                    useValue: {
                        intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
                            const req: Request = context.switchToHttp().getRequest();
                            req.passportUser = {
                                async personPermissions() {
                                    return personpermissionsRepoMock.loadPersonPermissions('');
                                },
                            } as PassportUser;
                            return next.handle();
                        },
                    },
                },
                { provide: APP_FILTER, useClass: ValidationExceptionFilter },
                { provide: APP_FILTER, useClass: AuthenticationExceptionFilter },
                { provide: APP_FILTER, useClass: SharedExceptionFilter },
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
                {
                    provide: KeycloakUserService,
                    useValue: createMock<KeycloakUserService>(KeycloakUserService, {
                        create: () =>
                            Promise.resolve({
                                ok: true,
                                value: faker.string.uuid(),
                            }),
                        setPassword: () =>
                            Promise.resolve({
                                ok: true,
                                value: faker.string.alphanumeric(16),
                            }),
                    }),
                },
            ],
        })
            .overrideModule(KeycloakConfigModule)
            .useModule(KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true }))
            .compile();

        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        rolleRepo = module.get(RolleRepo);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);
        personRepo = module.get(PersonRepository);
        organisationRepo = module.get(OrganisationRepository);
        personFactory = module.get(PersonFactory);

        const stepUpGuard: StepUpGuard = module.get(StepUpGuard);
        stepUpGuard.canActivate = vi.fn().mockReturnValue(true);

        dBiamPersonenkontextRepoInternal = module.get(DBiamPersonenkontextRepoInternal);
        personpermissionsRepoMock = module.get(PersonPermissionsRepo);
        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, 10000000);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        permissionsMock = createPersonPermissionsMock();
        personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
        permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
        await DatabaseTestModule.clearDatabase(orm);
        vi.clearAllMocks();
    });

    describe('/POST rolle', () => {
        it('should return created rolle', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();

            await em.findOneOrFail(OrganisationEntity, { id: organisation.id });

            const params: CreateRolleBodyParams = {
                name: faker.person.jobTitle(),
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: faker.helpers.enumValue(RollenArt),
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [],
                serviceProviderIds: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/rolle')
                .send(params);

            expect(response.status).toBe(201);
            expect(response.body as RolleWithServiceProvidersResponse).toEqual(
                expect.objectContaining({
                    name: params.name,
                    administeredBySchulstrukturknoten: params.administeredBySchulstrukturknoten,
                    rollenart: params.rollenart,
                    merkmale: params.merkmale,
                    systemrechte: [],
                    serviceProviders: [],
                } satisfies Partial<RolleWithServiceProvidersResponse>),
            );
        });

        it('should save rolle to db', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();

            const params: CreateRolleBodyParams = {
                name: faker.person.jobTitle(),
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: faker.helpers.enumValue(RollenArt),
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/rolle')
                .send(params);
            const rolle: RolleResponse = response.body as RolleResponse;

            await em.findOneOrFail(RolleEntity, { id: rolle.id });
        });

        it('should fail if user is missing permissions for the organisation', async () => {
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const params: CreateRolleBodyParams = {
                name: faker.person.jobTitle(),
                administeredBySchulstrukturknoten: faker.string.uuid(),
                rollenart: faker.helpers.enumValue(RollenArt),
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/rolle')
                .send(params);

            expect(response.status).toBe(404);
        });

        it('should fail if rollenart is invalid', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();

            const params: CreateRolleBodyParams = {
                name: faker.person.jobTitle(),
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: 'INVALID' as RollenArt,
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/rolle')
                .send(params);

            expect(response.status).toBe(400);
        });

        it('should fail if merkmal is invalid', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();

            const params: CreateRolleBodyParams = {
                name: faker.person.jobTitle(),
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: faker.helpers.enumValue(RollenArt),
                merkmale: ['INVALID' as RollenMerkmal],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/rolle')
                .send(params);

            expect(response.status).toBe(400);
        });

        it('should fail if merkmale are not unique', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();

            const params: CreateRolleBodyParams = {
                name: faker.person.jobTitle(),
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: faker.helpers.enumValue(RollenArt),
                merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT, RollenMerkmal.BEFRISTUNG_PFLICHT],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/rolle')
                .send(params);

            expect(response.status).toBe(400);
        });

        it('should fail Rolle-Name-Unique-On-SSK specification is violated', async () => {
            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();

            const rolleName: string = faker.person.jobTitle();
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    name: rolleName,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const params: CreateRolleBodyParams = {
                name: rolleName,
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: faker.helpers.enumValue(RollenArt),
                merkmale: [],
                systemrechte: [],
                serviceProviderIds: [],
            };

            const response: Response = await request(app.getHttpServer() as App)
                .post('/rolle')
                .send(params);
            const responseBody: DbiamRolleError = response.body as DbiamRolleError;

            expect(response.status).toBe(400);
            expect(responseBody.i18nKey).toStrictEqual('ROLLE_NAME_UNIQUE_ON_SSK');
            expect(responseBody.code).toStrictEqual(400);
        });
    });

    describe('/GET rollen', () => {
        it('should return all rollen', async () => {
            const orgaIds: string[] = (
                await Promise.all([
                    rolleRepo.save(DoFactory.createRolle(false)),
                    rolleRepo.save(DoFactory.createRolle(false)),
                    rolleRepo.save(DoFactory.createRolle(false)),
                ])
            ).map((r: Rolle<true> | DomainError) => {
                if (r instanceof DomainError) {
                    throw Error();
                }
                return r.administeredBySchulstrukturknoten;
            });

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(3);
        });

        it('should return no rollen', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(0);
        });

        it('should return rollen with the given queried name', async () => {
            const testRolle: { name: string; administeredBySchulstrukturknoten: string } | DomainError =
                await rolleRepo.save(DoFactory.createRolle(false));
            if (testRolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [testRolle.administeredBySchulstrukturknoten],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .query({ searchStr: testRolle.name })
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items).toContainEqual(expect.objectContaining({ name: testRolle.name }));
        });

        it('should return rollen assigned on the specified organisation', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const testRolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, { administeredBySchulstrukturknoten: orga.id }),
            );
            await rolleRepo.save(DoFactory.createRolle(false));
            if (testRolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orga.id],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .query({ organisationId: orga.id })
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items).toContainEqual(
                expect.objectContaining({
                    administeredBySchulstrukturknoten: orga.id,
                }),
            );
        });

        it('should return rollen with serviceproviders', async () => {
            const [sp1, sp2, sp3]: [ServiceProvider<true>, ServiceProvider<true>, ServiceProvider<true>] =
                await Promise.all([
                    createAndPersistServiceProvider(em),
                    createAndPersistServiceProvider(em),
                    createAndPersistServiceProvider(em),
                ]);

            const orgaIds: string[] = (
                await Promise.all([
                    rolleRepo.save(DoFactory.createRolle(false, { serviceProviderIds: [sp1.id] })),
                    rolleRepo.save(DoFactory.createRolle(false, { serviceProviderIds: [sp2.id, sp3.id] })),
                    rolleRepo.save(DoFactory.createRolle(false)),
                ])
            ).map((r: Rolle<true> | DomainError) => {
                if (r instanceof DomainError) {
                    throw new Error();
                }
                return r.administeredBySchulstrukturknoten;
            });

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(3);

            pagedResponse.items.forEach((item: RolleWithServiceProvidersResponse) => {
                item.serviceProviders.sort((a: ServiceProviderIdNameResponse, b: ServiceProviderIdNameResponse) =>
                    a.id.localeCompare(b.id),
                );
            });

            expect(pagedResponse.items).toContainEqual(
                expect.objectContaining({ serviceProviders: [{ id: sp1.id, name: sp1.name }] }),
            );
            expect(pagedResponse.items).toContainEqual(
                expect.objectContaining({
                    serviceProviders: [
                        { id: sp2.id, name: sp2.name },
                        { id: sp3.id, name: sp3.name },
                    ].sort(
                        (
                            a: {
                                id: string;
                                name: string;
                            },
                            b: {
                                id: string;
                                name: string;
                            },
                        ) => a.id.localeCompare(b.id),
                    ),
                }),
            );
            expect(pagedResponse.items).toContainEqual(expect.objectContaining({ serviceProviders: [] }));
        });

        it('should not return technische rollen', async () => {
            const orgaIds: string[] = (
                await Promise.all([
                    rolleRepo.save(DoFactory.createRolle(false, { istTechnisch: true })),
                    rolleRepo.save(DoFactory.createRolle(false, { istTechnisch: false })),
                    rolleRepo.save(DoFactory.createRolle(false, { istTechnisch: false })),
                ])
            ).map((r: Rolle<true> | DomainError) => {
                if (r instanceof DomainError) {
                    throw Error();
                }
                return r.administeredBySchulstrukturknoten;
            });

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
        });

        it('should return rollen available for erweiterung if systemrecht is set', async () => {
            const [orgaA, orgaB, orgaC]: [Organisation<true>, Organisation<true>, Organisation<true>] =
                await Promise.all([
                    organisationRepo.save(DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE })),
                    organisationRepo.save(DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE })),
                    organisationRepo.save(DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE })),
                ]);

            (
                await Promise.all([
                    rolleRepo.save(
                        DoFactory.createRolle(false, {
                            istTechnisch: false,
                            rollenart: RollenArt.LEHR,
                            administeredBySchulstrukturknoten: orgaA.id,
                        }),
                    ),
                    rolleRepo.save(
                        DoFactory.createRolle(false, {
                            istTechnisch: false,
                            rollenart: RollenArt.LERN,
                            administeredBySchulstrukturknoten: orgaB.id,
                        }),
                    ),
                    rolleRepo.save(
                        DoFactory.createRolle(false, {
                            istTechnisch: false,
                            rollenart: RollenArt.LEIT,
                            administeredBySchulstrukturknoten: orgaC.id,
                        }),
                    ),
                ])
            ).map((r: Rolle<true> | DomainError) => {
                if (r instanceof DomainError) {
                    throw Error();
                }
                return r.administeredBySchulstrukturknoten;
            });

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [orgaA.id, orgaB.id] });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle?systemrechte=ROLLEN_ERWEITERN')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
        });

        it('should return rollen available for erweiterung if systemrecht and orgaIds are set', async () => {
            const traeger: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.TRAEGER }),
            );
            const schule: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE, administriertVon: traeger.id }),
            );
            await Promise.all([
                rolleRepo.save(DoFactory.createRolle(false, { istTechnisch: false })),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        administeredBySchulstrukturknoten: traeger.id,
                        rollenart: RollenArt.LEHR,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        administeredBySchulstrukturknoten: traeger.id,
                        rollenart: RollenArt.ORGADMIN,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        administeredBySchulstrukturknoten: schule.id,
                        rollenart: RollenArt.LERN,
                    }),
                ),
                rolleRepo.save(DoFactory.createRolle(false, { istTechnisch: false, rollenart: RollenArt.LERN })),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [schule.id] });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle?systemrechte=ROLLEN_ERWEITERN&organisationId=${schule.id}`)
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
        });

        it('should return rollen available for erweiterung if systemrecht and rollenarten are set', async () => {
            const org: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const administeredBySchulstrukturknoten: string = org.id;
            const rollenart: RollenArt = RollenArt.LERN;
            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, { istTechnisch: false, rollenart, administeredBySchulstrukturknoten }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, { istTechnisch: false, rollenart, administeredBySchulstrukturknoten }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        rollenart: RollenArt.SYSADMIN,
                        administeredBySchulstrukturknoten,
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [administeredBySchulstrukturknoten],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get(
                    `/rolle?systemrechte=ROLLEN_ERWEITERN&rollenarten=${rollenart}&organisationId=${administeredBySchulstrukturknoten}`,
                )
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
        });

        it('should return rollen available for erweiterung including MPT rollen if both systemrechte are set', async () => {
            const org: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        rollenart: RollenArt.LEHR,
                        administeredBySchulstrukturknoten: org.id,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        rollenart: RollenArt.LERN,
                        administeredBySchulstrukturknoten: org.id,
                        merkmale: [RollenMerkmal.MPT_ROLLE],
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [org.id] });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .query({
                    systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN, RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN],
                    organisationContextForOperation: org.id,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            // Both the regular rolle AND the MPT rolle should be returned
            expect(pagedResponse.items).toHaveLength(2);
        });

        it('should exclude MPT rollen if only ROLLEN_ERWEITERN systemrecht is set', async () => {
            const org: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        rollenart: RollenArt.LEHR,
                        administeredBySchulstrukturknoten: org.id,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        rollenart: RollenArt.LERN,
                        administeredBySchulstrukturknoten: org.id,
                        merkmale: [RollenMerkmal.MPT_ROLLE],
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [org.id] });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle')
                .query({
                    systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN],
                    organisationContextForOperation: org.id,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            // Only the non-MPT rolle should be returned
            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items[0]?.rollenart).toBe(RollenArt.LEHR);
        });

        it('should return rollen available for import personenkontext if systemrecht is IMPORT_DURCHFUEHREN with given orga ID', async () => {
            const schule: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        administeredBySchulstrukturknoten: schule.id,
                        rollenart: RollenArt.LEHR,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        administeredBySchulstrukturknoten: schule.id,
                        rollenart: RollenArt.SYSADMIN,
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [schule.id] });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    systemrechte: 'IMPORT_DURCHFUEHREN',
                    organisationContextForOperation: schule.id,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;

            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items[0]?.rollenart).toBe(RollenArt.LEHR);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.IMPORT_DURCHFUEHREN],
                true,
                false,
            );
        });

        it('should return no rollen for import personenkontext if systemrecht is IMPORT_DURCHFUEHREN without orga ID', async () => {
            const schule: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        administeredBySchulstrukturknoten: schule.id,
                        rollenart: RollenArt.LEHR,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        istTechnisch: false,
                        administeredBySchulstrukturknoten: schule.id,
                        rollenart: RollenArt.SYSADMIN,
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [schule.id] });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle?systemrechte=IMPORT_DURCHFUEHREN`)
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;

            expect(pagedResponse.items).toHaveLength(0);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.IMPORT_DURCHFUEHREN],
                true,
                false,
            );
        });

        it('should return rollen filtered by multiple systemrechte', async () => {
            const rolleA: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            const rolleB: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolleA instanceof DomainError || rolleB instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [rolleA.administeredBySchulstrukturknoten],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle?rolleIds=${rolleA.id}&systemrechte=ROLLEN_ERWEITERN&systemrechte=ROLLEN_VERWALTEN`)
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(1);
        });

        it('should return only MPT rollen for single MPT_ROLLEN_VERWALTEN systemrecht', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const mptRolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.SCHB,
                    merkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
            const nonMptRolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (mptRolle instanceof DomainError || nonMptRolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle?systemrechte=MPT_ROLLEN_VERWALTEN')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items).toEqual(
                expect.arrayContaining([expect.objectContaining({ id: mptRolle.id, rollenart: RollenArt.SCHB })]),
            );
        });

        it('should return only MPT rollen for single MPT_ROLLEN_VERWALTEN systemrecht and orgaId', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const otherOrga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const mptRolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.SCHB,
                    merkmale: [RollenMerkmal.MPT_ROLLE],
                }),
            );
            const otherOrgaMptRolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: otherOrga.id,
                    rollenart: RollenArt.SORGBER,
                }),
            );
            if (mptRolle instanceof DomainError || otherOrgaMptRolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle?systemrechte=MPT_ROLLEN_VERWALTEN&organisationenForFilter=${orga.id}`)
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining<Partial<RolleWithServiceProvidersResponse>>({
                        id: mptRolle.id,
                        administeredBySchulstrukturknoten: orga.id,
                        rollenart: RollenArt.SCHB,
                    }),
                ]),
            );
        });

        it('should keep standard path for multiple systemrechte including MPT_ROLLEN_VERWALTEN', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const mptRolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.SCHB,
                }),
            );
            const nonMptRolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: orga.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (mptRolle instanceof DomainError || nonMptRolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get('/rolle?systemrechte=MPT_ROLLEN_VERWALTEN&systemrechte=ROLLEN_VERWALTEN')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
            expect(pagedResponse.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: mptRolle.id }),
                    expect.objectContaining({ id: nonMptRolle.id }),
                ]),
            );
        });

        it('should return rollen filtered by organisationenForFilter', async () => {
            const orgaA: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const orgaB: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, { administeredBySchulstrukturknoten: orgaA.id, istTechnisch: false }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, { administeredBySchulstrukturknoten: orgaA.id, istTechnisch: false }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, { administeredBySchulstrukturknoten: orgaB.id, istTechnisch: false }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    organisationenForFilter: orgaA.id,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
            expect(
                pagedResponse.items.every(
                    (r: RolleWithServiceProvidersResponse) => r.administeredBySchulstrukturknoten === orgaA.id,
                ),
            ).toBe(true);
        });

        it('should return rollen filtered by merkmale', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                        istTechnisch: false,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                        istTechnisch: false,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        merkmale: [],
                        istTechnisch: false,
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    merkmale: RollenMerkmal.BEFRISTUNG_PFLICHT,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
            expect(
                pagedResponse.items.every((r: RolleWithServiceProvidersResponse) =>
                    r.merkmale.includes(RollenMerkmal.BEFRISTUNG_PFLICHT),
                ),
            ).toBe(true);
        });

        it('should return rollen filtered by serviceProviderIds', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
            const sp1: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const sp2: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        serviceProviderIds: [sp1.id],
                        istTechnisch: false,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        serviceProviderIds: [sp1.id],
                        istTechnisch: false,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        serviceProviderIds: [sp2.id],
                        istTechnisch: false,
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    serviceProviderIds: sp1.id,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
            expect(
                pagedResponse.items.every((r: RolleWithServiceProvidersResponse) =>
                    r.serviceProviders.some((sp: { id: string; name: string }) => sp.id === sp1.id),
                ),
            ).toBe(true);
        });

        it('should return rollen filtered by rollenarten without operation right', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            await Promise.all([
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        rollenart: RollenArt.LEHR,
                        istTechnisch: false,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        rollenart: RollenArt.LEHR,
                        istTechnisch: false,
                    }),
                ),
                rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: orga.id,
                        rollenart: RollenArt.LERN,
                        istTechnisch: false,
                    }),
                ),
            ]);

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    rollenarten: RollenArt.LEHR,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(2);
            expect(
                pagedResponse.items.every((r: RolleWithServiceProvidersResponse) => r.rollenart === RollenArt.LEHR),
            ).toBe(true);
        });

        it('should return 400 when organisationenForFilter is combined with an operation right', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    systemrechte: RollenSystemRecht.ROLLEN_ERWEITERN.name,
                    organisationenForFilter: orga.id,
                })
                .send();

            expect(response.status).toBe(400);
        });

        it('should return 400 when organisationContextForOperation is used without an operation right', async () => {
            const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    organisationContextForOperation: orga.id,
                })
                .send();

            expect(response.status).toBe(400);
        });
    });

    describe(`when systemrecht is ${RollenSystemRechtEnum.IMPORT_DURCHFUEHREN}`, () => {
        const systemrechte: Array<RollenSystemRechtEnum> = [RollenSystemRechtEnum.IMPORT_DURCHFUEHREN];

        it('should return rollen available for import personenkontext', async () => {
            const schule: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const schule2: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            const [role1, , role3]: [Rolle<true> | DomainError, Rolle<true> | DomainError, Rolle<true> | DomainError] =
                await Promise.all([
                    rolleRepo.save(
                        DoFactory.createRolle(false, {
                            istTechnisch: false,
                            administeredBySchulstrukturknoten: schule.id,
                            rollenart: RollenArt.LEHR,
                        }),
                    ),
                    rolleRepo.save(
                        DoFactory.createRolle(false, {
                            istTechnisch: false,
                            administeredBySchulstrukturknoten: schule.id,
                            rollenart: RollenArt.SYSADMIN,
                        }),
                    ),
                    rolleRepo.save(
                        DoFactory.createRolle(false, {
                            istTechnisch: false,
                            administeredBySchulstrukturknoten: schule2.id,
                            rollenart: RollenArt.LEHR,
                        }),
                    ),
                ]);
            if (role1 instanceof DomainError || role3 instanceof DomainError) {
                expect.fail('error during test setup. role was not persisted');
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    systemrechte,
                    rollenarten: [RollenArt.LEHR],
                    organisationContextForOperation: schule.id,
                })
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;

            expect(pagedResponse.items).toHaveLength(1);
            expect(pagedResponse.items).toEqual(
                expect.arrayContaining([expect.objectContaining({ id: role1.id, name: role1.name })]),
            );
            expect(pagedResponse.items[0]?.rollenart).toBe(RollenArt.LEHR);
            expect(permissionsMock.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                [RollenSystemRecht.IMPORT_DURCHFUEHREN],
                true,
                false,
            );
        });

        it('should return nothing if no organisationID is provided', async () => {
            const schule: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            await rolleRepo.save(
                DoFactory.createRolle(false, {
                    istTechnisch: false,
                    administeredBySchulstrukturknoten: schule.id,
                    rollenart: RollenArt.LEHR,
                }),
            );

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle`)
                .query({
                    systemrechte,
                    rollenarten: [RollenArt.LEHR],
                } as FindRollenQueryParams)
                .send();

            expect(response.status).toBe(200);
            const pagedResponse: PagedResponse<RolleWithServiceProvidersResponse> =
                response.body as PagedResponse<RolleWithServiceProvidersResponse>;
            expect(pagedResponse.items).toHaveLength(0);
        });
    });

    describe('/GET rolle by id', () => {
        it('should return rolle', async () => {
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [rolle.administeredBySchulstrukturknoten],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolle.id}`)
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
        });

        it('should return rolle with serviceproviders', async () => {
            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [rolle.administeredBySchulstrukturknoten],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolle.id}`)
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            const responseBody: RolleWithServiceProvidersResponse = response.body as RolleWithServiceProvidersResponse;

            expect(responseBody?.serviceProviders).toContainEqual(
                expect.objectContaining({ id: serviceProvider.id, name: serviceProvider.name }),
            );
        });

        it('should return 404 when rolle could not be found', async () => {
            await rolleRepo.save(DoFactory.createRolle(false));
            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${faker.string.uuid()}`)
                .send();

            expect(response.status).toBe(404);
            expect(response.body).toBeInstanceOf(Object);
        });

        it('should return 404 when rolle is technical', async () => {
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, { istTechnisch: true }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [rolle.administeredBySchulstrukturknoten],
            });

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolle.id}`)
                .send();

            expect(response.status).toBe(404);
            expect(response.body).toBeInstanceOf(Object);
        });
    });

    describe('/GET rolleId/serviceProviders', () => {
        describe('when rolle exists', () => {
            it('should return 200 and a list of serviceProviders', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
                const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, { serviceProviderIds: [serviceProvider.id] }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/rolle/${rolle.id}/serviceProviders`)
                    .send();

                expect(response.status).toBe(200);
            });
        });

        describe('when rolle does not exist', () => {
            it('should return 404', async () => {
                const validButNonExistingUUID: string = faker.string.uuid();
                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/rolle/${validButNonExistingUUID}/serviceProviders`)
                    .send();

                expect(response.status).toBe(404);
            });
        });
    });

    describe('GET systemrechte', () => {
        it('should return all systemrechte', async () => {
            const response: Response = await request(app.getHttpServer() as App).get('/rolle/systemrechte');
            expect(response.status).toBe(200);
            expect(response.body).toEqual(
                RollenSystemRecht.ALL.map((sr: RollenSystemRecht) => new SystemRechtResponse(sr)),
            );
        });
    });

    describe('/PUT rolle', () => {
        it('should return updated rolle', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();
            await em.findOneOrFail(OrganisationEntity, { id: organisation.id });

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [organisation.id] });

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                providedOnSchulstrukturknoten: organisation.id,
            });

            const params: UpdateRolleBodyParams = {
                name: faker.person.jobTitle(),
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN],
                serviceProviderIds: [serviceProvider.id],
                version: 1,
            };

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/rolle/${rolle.id}`)
                .send(params);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: rolle.id,
                name: params.name,
                administeredBySchulstrukturknoten: organisation.id,
                rollenart: rolle.rollenart,
                merkmale: params.merkmale,
                systemrechte: [new SystemRechtResponse(RollenSystemRecht.ROLLEN_ERWEITERN)],
            });
        });

        it('should fail if the rolle does not exist', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

            const params: UpdateRolleBodyParams = {
                name: faker.person.jobTitle(),
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
                version: 1,
            };

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/rolle/${faker.string.uuid()}`)
                .send(params);

            expect(response.status).toBe(404);
        });

        it('should return error with status-code 404 if user does NOT have permissions', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();
            await em.findOneOrFail(OrganisationEntity, { id: organisation.id });

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );

            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);

            const params: UpdateRolleBodyParams = {
                name: faker.person.jobTitle(),
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
                version: 1,
            };

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/rolle/${rolle.id}`)
                .send(params);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                code: 404,
                i18nKey: 'MISSING_PERMISSIONS',
            });
        });

        it('should return error with status-code 404 if rolle is technical', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();
            await em.findOneOrFail(OrganisationEntity, { id: organisation.id });

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                    istTechnisch: true,
                }),
            );

            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [organisation.id] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);

            const params: UpdateRolleBodyParams = {
                name: faker.person.jobTitle(),
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [],
                version: 1,
            };

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/rolle/${rolle.id}`)
                .send(params);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                code: 404,
                i18nKey: 'ENTITY_NOT_FOUND',
            });
        });

        describe('Update Merkmale', () => {
            it('should return 400 if rolle is already assigned', async () => {
                const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
                const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
                const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                    {
                        organisation: savedUserOrganisation,
                        rolle: { systemrechte: [], serviceProviderIds: [] },
                    },
                ];

                const personData: Person<false> | DomainError = await personFactory.createNew({
                    vorname: faker.person.firstName(),
                    familienname: faker.person.lastName(),
                    username: faker.internet.username(),
                    password: generatePassword(),
                });
                if (personData instanceof DomainError) {
                    throw personData;
                }
                const person: Person<true> | DomainError = await personRepo.save(personData);
                if (person instanceof DomainError) {
                    throw person;
                }

                const organisation: OrganisationEntity = new OrganisationEntity();
                organisation.typ = OrganisationsTyp.SCHULE;
                await em.persist(organisation).flush();
                await em.findOneOrFail(OrganisationEntity, { id: organisation.id });

                const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisation.id,
                        rollenart: RollenArt.LEHR,
                        istTechnisch: false,
                        merkmale: [],
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                await dBiamPersonenkontextRepoInternal.save(
                    DoFactory.createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                );

                personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [organisation.id] });
                permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

                const params: UpdateRolleBodyParams = {
                    name: faker.person.jobTitle(),
                    merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                    systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                    serviceProviderIds: [],
                    version: 1,
                };

                const response: Response = await request(app.getHttpServer() as App)
                    .put(`/rolle/${rolle.id}`)
                    .send(params);

                expect(response.status).toBe(400);
                expect(response.body).toEqual({
                    code: 400,
                    i18nKey: 'UPDATE_MERKMALE_ERROR',
                });
            });
        });

        it('should return error if new name has trailing space', async () => {
            const userOrganisation: Organisation<false> = DoFactory.createOrganisation(false);
            const savedUserOrganisation: Organisation<true> = await organisationRepo.save(userOrganisation);
            const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
                {
                    organisation: savedUserOrganisation,
                    rolle: { systemrechte: [], serviceProviderIds: [] },
                },
            ];

            const organisation: OrganisationEntity = new OrganisationEntity();
            await em.persist(organisation).flush();

            await em.findOneOrFail(OrganisationEntity, { id: organisation.id });

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const params: UpdateRolleBodyParams = {
                name: ' newName ',
                merkmale: [faker.helpers.enumValue(RollenMerkmal)],
                systemrechte: [faker.helpers.enumValue(RollenSystemRechtEnum)],
                serviceProviderIds: [serviceProvider.id],
                version: 1,
            };

            personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(permissionsMock);
            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [organisation.id] });
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/rolle/${rolle.id}`)
                .send(params);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                code: 400,
                i18nKey: 'ROLLENNAME_ENTHAELT_LEERZEICHEN',
            });
        });
    });

    describe('/DELETE rolleId', () => {
        let organisation: Organisation<true>;

        beforeEach(async () => {
            organisation = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
        });

        describe('should return error', () => {
            it('if rolle does NOT exist', async () => {
                const response: Response = await request(app.getHttpServer() as App)
                    .delete(`/rolle/${faker.string.uuid()}`)
                    .send();

                expect(response.status).toBe(404);
            });

            it('if rolle is already assigned to a Personenkontext', async () => {
                const person: Person<true> | DomainError = await personRepo.save(DoFactory.createPerson(false));
                if (person instanceof DomainError) {
                    throw person;
                }

                const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisation.id,
                        rollenart: RollenArt.LEHR,
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                await dBiamPersonenkontextRepoInternal.save(
                    DoFactory.createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                    }),
                );

                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [organisation.id],
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .delete(`/rolle/${rolle.id}`)
                    .send();

                expect(response.status).toBe(400);
                expect(response.body).toEqual({
                    code: 400,
                    i18nKey: 'ROLLE_HAT_PERSONENKONTEXTE_ERROR',
                });
            });

            it('if user does NOT have permissions', async () => {
                const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisation.id,
                        rollenart: RollenArt.LEHR,
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const response: Response = await request(app.getHttpServer() as App)
                    .delete(`/rolle/${rolle.id}`)
                    .send();

                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    code: 404,
                    i18nKey: 'MISSING_PERMISSIONS',
                });
            });

            it('if rolle is technical', async () => {
                const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisation.id,
                        rollenart: RollenArt.LEHR,
                        istTechnisch: true,
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [organisation.id],
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .delete(`/rolle/${rolle.id}`)
                    .send();

                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    code: 404,
                    i18nKey: 'ENTITY_NOT_FOUND',
                });
            });
        });

        describe('should succeed', () => {
            it('if all conditions are passed', async () => {
                const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
                const otherServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

                const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: organisation.id,
                        rollenart: RollenArt.LEHR,
                        serviceProviderIds: [serviceProvider.id],
                        istTechnisch: false,
                    }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }
                await rollenerweiterungRepo.create(
                    DoFactory.createRollenerweiterung(false, {
                        organisationId: organisation.id,
                        rolleId: rolle.id,
                        serviceProviderId: otherServiceProvider.id,
                    }),
                );

                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({
                    all: false,
                    orgaIds: [organisation.id],
                });

                const response: Response = await request(app.getHttpServer() as App)
                    .delete(`/rolle/${rolle.id}`)
                    .send();

                expect(response.status).toBe(204);
                await expect(rolleRepo.findById(rolle.id)).resolves.toBeNull();
                await expect(
                    rollenerweiterungRepo.exists({
                        organisationId: organisation.id,
                        rolleId: rolle.id,
                        serviceProviderId: otherServiceProvider.id,
                    }),
                ).resolves.toBeFalsy();
            });
        });
    });

    describe('GET :rolleId/angeboteViaRollenerweiterungen', () => {
        it('should return all rollenerweiterungen for a rolle', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const serviceProvider1: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const serviceProvider2: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            await createAndPersistServiceProvider(em);

            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider1.id,
                }),
            );
            await rollenerweiterungRepo.create(
                DoFactory.createRollenerweiterung(false, {
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    serviceProviderId: serviceProvider2.id,
                }),
            );

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolle.id}/angebote-via-rollenerweiterungen`)
                .query({ organisationId: organisation.id })
                .send();

            expect(response.status).toBe(200);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                organisation.id,
                RollenSystemRecht.ROLLEN_ERWEITERN,
            );
            const serviceProviderResponse: ServiceProviderResponse[] = response.body as ServiceProviderResponse[];
            expect(serviceProviderResponse).toHaveLength(2);
        });

        it('should return empty array if rolle has no rollenerweiterungen', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolle.id}/angebote-via-rollenerweiterungen`)
                .query({ organisationId: organisation.id })
                .send();

            expect(response.status).toBe(200);
            const serviceProviderResponse: ServiceProviderResponse[] = response.body as ServiceProviderResponse[];
            expect(serviceProviderResponse).toHaveLength(0);
        });

        it('should return 400 when no organisationId is provided', async () => {
            const rolleId: string = faker.string.uuid();

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolleId}/angebote-via-rollenerweiterungen`)
                .send();

            expect(response.status).toBe(400);
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
        });

        it('should return 404 if rolle does not exist', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${faker.string.uuid()}/angebote-via-rollenerweiterungen`)
                .query({ organisationId: organisation.id })
                .send();

            expect(response.status).toBe(404);
        });

        it('should return 404 if user does not have permissions', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolle.id}/angebote-via-rollenerweiterungen`)
                .query({ organisationId: organisation.id })
                .send();

            expect(response.status).toBe(404);
        });

        it('should return 404 when user only has permission for another organisation', async () => {
            const organisation1: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const organisation2: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation1.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }
            permissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                (organisationId: string): Promise<boolean> => Promise.resolve(organisationId === organisation1.id),
            );

            const response: Response = await request(app.getHttpServer() as App)
                .get(`/rolle/${rolle.id}/angebote-via-rollenerweiterungen`)
                .query({ organisationId: organisation2.id })
                .send();

            expect(response.status).toBe(404);
        });
    });

    describe('POST rolle/:rolleId/organisation/:organisationId/apply', () => {
        it('should apply rollenerweiterung changes', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                providedOnSchulstrukturknoten: organisation.id,
            });

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [organisation.id],
            });
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post(`/rolle/${rolle.id}/organisation/${organisation.id}/apply`)
                .send({
                    addErweiterungenForServiceProviderIds: [serviceProvider.id],
                    removeErweiterungenForServiceProviderIds: [],
                });

            expect(response.status).toBe(201);

            const rollenerweiterungen: Rollenerweiterung<true>[] =
                await rollenerweiterungRepo.findManyByOrganisationAndRolle([
                    {
                        organisationId: organisation.id,
                        rolleId: rolle.id,
                    },
                ]);

            expect(rollenerweiterungen).toHaveLength(1);
            expect(rollenerweiterungen[0]?.serviceProviderId).toBe(serviceProvider.id);
        });

        it('should return 404 if rolle does not exist', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            const response: Response = await request(app.getHttpServer() as App)
                .post(`/rolle/${faker.string.uuid()}/organisation/${organisation.id}/apply`)
                .send({
                    addErweiterungenForServiceProviderIds: [],
                    removeErweiterungenForServiceProviderIds: [],
                });

            expect(response.status).toBe(404);
        });

        it('should return 404 if organisation does not exist', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            const response: Response = await request(app.getHttpServer() as App)
                .post(`/rolle/${rolle.id}/organisation/${faker.string.uuid()}/apply`)
                .send({
                    addErweiterungenForServiceProviderIds: [],
                    removeErweiterungenForServiceProviderIds: [],
                });

            expect(response.status).toBe(404);
        });

        it('should return 404 if user is missing permissions', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);

            const response: Response = await request(app.getHttpServer() as App)
                .post(`/rolle/${rolle.id}/organisation/${organisation.id}/apply`)
                .send({
                    addErweiterungenForServiceProviderIds: [],
                    removeErweiterungenForServiceProviderIds: [],
                });

            expect(response.status).toBe(404);
        });

        it('should return 400 if applying rollenerweiterung changes fails', async () => {
            const serviceProviderId: string = faker.string.uuid();
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );

            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [organisation.id],
            });
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post(`/rolle/${rolle.id}/organisation/${organisation.id}/apply`)
                .send({
                    addErweiterungenForServiceProviderIds: [serviceProviderId],
                    removeErweiterungenForServiceProviderIds: [],
                });

            expect(response.status).toBe(400);

            expect(response.body).toEqual({
                code: 400,
                idsWithI18nKeys: [
                    {
                        id: serviceProviderId,
                        errorIdType: ErrorIdType.ROLLE,
                        i18nKey: 'NOT_FOUND',
                    },
                ],
            });
        });
    });
});
