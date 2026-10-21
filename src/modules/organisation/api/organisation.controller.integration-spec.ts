import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { type CallHandler, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { type Request } from 'express';
import { type Observable } from 'rxjs';
import request, { type Response } from 'supertest';
import { type App } from 'supertest/types.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import {
    createPassportUserMock,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
    KeycloakConfigTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { SharedErrorI18nTypes } from '../../../shared/error/dbiam-shared.error.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { type OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { KeycloakUserService } from '../../keycloak-administration/domain/keycloak-user.service.js';
import { KeycloakConfigModule } from '../../keycloak-administration/keycloak-config.module.js';
import { type Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { DBiamPersonenkontextRepoInternal } from '../../personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { OrganisationApiModule } from '../organisation-api.module.js';
import { OrganisationEntity } from '../persistence/organisation.entity.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationSpecificationErrorI18nTypes } from './dbiam-organisation.error.js';
import { InternalRollenerweiterungRepo } from '../../rolle/repo/internal-rollenerweiterung.repo.js';

describe('Organisation API', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let em: EntityManager;
    let rolleRepo: RolleRepo;
    let personRepo: PersonRepository;
    let dBiamPersonenkontextRepoInternal: DBiamPersonenkontextRepoInternal;
    let organisationRepo: OrganisationRepository;
    let rollenerweiterungRepo: InternalRollenerweiterungRepo;

    let permissionsMock: DeepMocked<PersonPermissions>;
    let keycloakUserServiceMock: DeepMocked<KeycloakUserService>;

    beforeAll(async () => {
        keycloakUserServiceMock = createMock<KeycloakUserService>(KeycloakUserService);
        keycloakUserServiceMock.create.mockImplementation(() =>
            Promise.resolve({
                ok: true,
                value: faker.string.uuid(),
            }),
        );
        keycloakUserServiceMock.setPassword.mockImplementation(() =>
            Promise.resolve({
                ok: true,
                value: faker.string.alphanumeric(16),
            }),
        );

        permissionsMock = createPersonPermissionsMock();

        const module: TestingModule = await Test.createTestingModule({
            imports: [
                OrganisationApiModule,
                CommonTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
            ],
            providers: [
                {
                    provide: APP_FILTER,
                    useClass: SharedExceptionFilter,
                },
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: APP_INTERCEPTOR,
                    useValue: {
                        intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
                            const req: Request = context.switchToHttp().getRequest();
                            req.passportUser = createPassportUserMock(permissionsMock);
                            return next.handle();
                        },
                    },
                },
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
                {
                    provide: KeycloakUserService,
                    useValue: keycloakUserServiceMock,
                },
            ],
        })
            .overrideModule(KeycloakConfigModule)
            .useModule(KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true }))
            .compile();

        const stepUpGuard: StepUpGuard = module.get(StepUpGuard);
        stepUpGuard.canActivate = vi.fn().mockReturnValue(true);

        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        rolleRepo = module.get(RolleRepo);
        personRepo = module.get(PersonRepository);
        dBiamPersonenkontextRepoInternal = module.get(DBiamPersonenkontextRepoInternal);
        organisationRepo = module.get(OrganisationRepository);
        rollenerweiterungRepo = module.get(InternalRollenerweiterungRepo);

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, 10000000);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    describe('/POST organisation kennung', () => {
        it('should reject a kennung for a non-school organisation without persisting it', async () => {
            const parent: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND, kennung: undefined }),
            );
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/organisationen')
                .send({
                    typ: OrganisationsTyp.SONSTIGE,
                    name: 'Organisation with forbidden kennung',
                    kennung: '1234567',
                    administriertVon: parent.id,
                    zugehoerigZu: parent.id,
                });

            expect(response.status).toBe(400);
            expect(response.body).toEqual(
                expect.objectContaining({
                    code: 400,
                    i18nKey: OrganisationSpecificationErrorI18nTypes.KENNUNG_ONLY_FOR_SCHULE,
                }),
            );
            expect(await em.fork().count(OrganisationEntity, {})).toBe(1);
        });

        it('should create a school with a kennung', async () => {
            const parent: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND, kennung: undefined }),
            );
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/organisationen')
                .send({
                    typ: OrganisationsTyp.SCHULE,
                    name: 'School with kennung',
                    kennung: '1234567',
                    administriertVon: parent.id,
                    zugehoerigZu: parent.id,
                });

            expect(response.status).toBe(201);
            const storedOrganisation: OrganisationEntity = await em
                .fork()
                .findOneOrFail(OrganisationEntity, { name: 'School with kennung' });
            expect(storedOrganisation.kennung).toBe('1234567');
        });

        it('should create a non-school organisation without a kennung', async () => {
            const parent: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND, kennung: undefined }),
            );
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/organisationen')
                .send({
                    typ: OrganisationsTyp.SONSTIGE,
                    name: 'Organisation without kennung',
                    administriertVon: parent.id,
                    zugehoerigZu: parent.id,
                });

            expect(response.status).toBe(201);
            const storedOrganisation: OrganisationEntity = await em
                .fork()
                .findOneOrFail(OrganisationEntity, { name: 'Organisation without kennung' });
            expect(storedOrganisation.kennung).toBeUndefined();
        });
    });

    describe('/PUT organisation kennung', () => {
        it('should preserve the stored school kennung when another kennung is submitted', async () => {
            const parent: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND, kennung: undefined }),
            );
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SCHULE,
                    kennung: '1234567',
                    administriertVon: parent.id,
                    zugehoerigZu: parent.id,
                }),
            );
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/organisationen/${organisation.id}`)
                .send({
                    typ: OrganisationsTyp.SCHULE,
                    name: 'Updated school',
                    kennung: '7654321',
                    administriertVon: parent.id,
                    zugehoerigZu: parent.id,
                });

            expect(response.status).toBe(200);
            const storedOrganisation: OrganisationEntity = await em
                .fork()
                .findOneOrFail(OrganisationEntity, organisation.id);
            expect(storedOrganisation.name).toBe('Updated school');
            expect(storedOrganisation.kennung).toBe('1234567');
        });

        it('should leave a non-school kennung unset when a kennung is submitted', async () => {
            const parent: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND, kennung: undefined }),
            );
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SONSTIGE,
                    kennung: undefined,
                    administriertVon: parent.id,
                    zugehoerigZu: parent.id,
                }),
            );
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/organisationen/${organisation.id}`)
                .send({
                    typ: OrganisationsTyp.SONSTIGE,
                    name: 'Updated organisation',
                    kennung: '7654321',
                    administriertVon: parent.id,
                    zugehoerigZu: parent.id,
                });

            expect(response.status).toBe(200);
            const storedOrganisation: OrganisationEntity = await em
                .fork()
                .findOneOrFail(OrganisationEntity, organisation.id);
            expect(storedOrganisation.name).toBe('Updated organisation');
            expect(storedOrganisation.kennung).toBeUndefined();
        });
    });

    describe('/PUT organisation authorization', () => {
        const setup = async (
            type: OrganisationsTyp,
        ): Promise<{
            originalSchool: Organisation<true>;
            authorizedSchool: Organisation<true>;
            organisation: Organisation<true>;
        }> => {
            const originalSchool: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const authorizedSchool: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, {
                    typ: type,
                    administriertVon: originalSchool.id,
                    zugehoerigZu: originalSchool.id,
                }),
            );
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockImplementation(
                (requestedTyp: OrganisationsTyp, administriertVon?: string): Promise<boolean> =>
                    Promise.resolve(
                        requestedTyp === OrganisationsTyp.KLASSE && administriertVon === authorizedSchool.id,
                    ),
            );
            return { originalSchool, authorizedSchool, organisation };
        };

        const assertUnauthorizedUpdate = async (type: OrganisationsTyp): Promise<void> => {
            const {
                originalSchool,
                authorizedSchool,
                organisation,
            }: {
                originalSchool: Organisation<true>;
                authorizedSchool: Organisation<true>;
                organisation: Organisation<true>;
            } = await setup(type);

            const response: Response = await request(app.getHttpServer() as App)
                .put(`/organisationen/${organisation.id}`)
                .send({
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: authorizedSchool.id,
                    zugehoerigZu: authorizedSchool.id,
                    name: '7a',
                });

            expect(response.status).toBe(404);
            expect(response.body).toEqual(
                expect.objectContaining({
                    code: 404,
                    i18nKey: SharedErrorI18nTypes.MISSING_PERMISSIONS,
                }),
            );
            expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledWith(
                organisation.typ,
                originalSchool.id,
            );
            const storedOrganisation: OrganisationEntity = await em
                .fork()
                .findOneOrFail(OrganisationEntity, organisation.id);
            expect(storedOrganisation).toEqual(
                expect.objectContaining({
                    typ: organisation.typ,
                    name: organisation.name,
                    administriertVon: originalSchool.id,
                    zugehoerigZu: originalSchool.id,
                }),
            );
        };

        describe('when a school is submitted as a class to use class-management permissions', () => {
            it('should check the stored school type and reject the update without changing the organisation', async () => {
                await assertUnauthorizedUpdate(OrganisationsTyp.SCHULE);

                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockReset();
            });
        });

        describe('when a class from another school is submitted with an authorized parent', () => {
            it('should check the stored parent and reject the update without changing the organisation', async () => {
                await assertUnauthorizedUpdate(OrganisationsTyp.KLASSE);

                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockReset();
            });
        });
    });

    describe('/DELETE organisation', () => {
        describe('when all conditions pass', () => {
            it('should succeed', async () => {
                permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
                const orga: OrganisationEntity = new OrganisationEntity();
                Object.assign(orga, DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }));
                await em.persist(orga).flush();

                const response: Response = await request(app.getHttpServer() as App)
                    .delete(`/organisationen/${orga.id}`)
                    .send();
                expect(response.status).toBe(204);
            });
        });

        describe('when orga is still referenced', () => {
            type TestFixture = {
                entityType: string;
                setup: () => Promise<string>;
                i18nKey: OrganisationSpecificationErrorI18nTypes;
            };
            describe.each([
                {
                    entityType: 'Organisation',
                    setup: async (): Promise<string> => {
                        const savedOrga: Organisation<true> = await organisationRepo.save(
                            DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                        );
                        await organisationRepo.save(
                            DoFactory.createOrganisation(false, {
                                typ: OrganisationsTyp.KLASSE,
                                administriertVon: savedOrga.id,
                            }),
                        );
                        return savedOrga.id;
                    },
                    i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_KINDER,
                },
                {
                    entityType: 'Rolle',
                    setup: async (): Promise<string> => {
                        const savedOrga: Organisation<true> = await organisationRepo.save(
                            DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                        );
                        await rolleRepo.save(
                            DoFactory.createRolle(false, {
                                administeredBySchulstrukturknoten: savedOrga.id,
                            }),
                        );
                        return savedOrga.id;
                    },
                    i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_ROLLEN,
                },
                {
                    entityType: 'Personenkontext',
                    setup: async (): Promise<string> => {
                        const savedOrga: Organisation<true> = await organisationRepo.save(
                            DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                        );

                        const person: Person<true> | DomainError = await personRepo.save(DoFactory.createPerson(false));
                        if (person instanceof DomainError) {
                            throw person;
                        }

                        const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
                        if (rolle instanceof DomainError) {
                            throw rolle;
                        }

                        await dBiamPersonenkontextRepoInternal.save(
                            DoFactory.createPersonenkontext(false, {
                                organisationId: savedOrga.id,
                                personId: person.id,
                                rolleId: rolle.id,
                            }),
                        );
                        return savedOrga.id;
                    },
                    i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_PERSONENKONTEXTE,
                },
                {
                    entityType: 'ServiceProvider',
                    setup: async (): Promise<string> => {
                        const savedOrga: Organisation<true> = await organisationRepo.save(
                            DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                        );

                        await createAndPersistServiceProvider(em, { providedOnSchulstrukturknoten: savedOrga.id });
                        return savedOrga.id;
                    },
                    i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_ANGEBOTE,
                },
                {
                    entityType: 'Rollenerweiterung',
                    setup: async (): Promise<string> => {
                        const savedOrga: Organisation<true> = await organisationRepo.save(
                            DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                        );
                        const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
                        if (rolle instanceof DomainError) {
                            throw rolle;
                        }
                        const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                            merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                        });
                        await rollenerweiterungRepo.create(
                            DoFactory.createRollenerweiterung(false, {
                                organisationId: savedOrga.id,
                                rolleId: rolle.id,
                                serviceProviderId: serviceProvider.id,
                            }),
                        );
                        return savedOrga.id;
                    },
                    i18nKey: OrganisationSpecificationErrorI18nTypes.ORGANISATION_HAT_ROLLENERWEITERUNGEN,
                },
            ] as Array<TestFixture>)('by $entityType', ({ setup, i18nKey }: TestFixture) => {
                let orgaId: OrganisationID;
                beforeEach(async () => {
                    permissionsMock.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: true });
                    permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
                    orgaId = await setup();
                });

                it('should fail', async () => {
                    const response: Response = await request(app.getHttpServer() as App)
                        .delete(`/organisationen/${orgaId}`)
                        .send();
                    expect(response.status).toBe(400);
                    expect(response.body).toEqual(
                        expect.objectContaining({
                            code: 400,
                            i18nKey,
                        }),
                    );
                });
            });
        });
    });
});
