import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { CallHandler, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { Observable } from 'rxjs';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    createPassportUserMock,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
    KeycloakConfigTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { KeycloakUserService } from '../../keycloak-administration/domain/keycloak-user.service.js';
import { KeycloakConfigModule } from '../../keycloak-administration/keycloak-config.module.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { DBiamPersonenkontextRepoInternal } from '../../personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationApiModule } from '../organisation-api.module.js';
import { OrganisationEntity } from '../persistence/organisation.entity.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationSpecificationErrorI18nTypes } from './dbiam-organisation.error.js';

describe('Organisation API', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let em: EntityManager;
    let rolleRepo: RolleRepo;
    let personRepo: PersonRepository;
    let dBiamPersonenkontextRepoInternal: DBiamPersonenkontextRepoInternal;
    let organisationRepo: OrganisationRepository;
    let rollenerweiterungRepo: RollenerweiterungRepo;

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
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);

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
