import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { CallHandler, ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { Observable } from 'rxjs';
import request, { Response } from 'supertest';
import { App } from 'supertest/types.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { DeepMocked } from '../../../../test/utils/createMock.js';
import {
    createPassportUserMock,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
    KeycloakConfigTestModule,
} from '../../../../test/utils/index.js';
import { GlobalValidationPipe } from '../../../shared/validation/index.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { KeycloakAdministrationModule } from '../../keycloak-administration/keycloak-administration.module.js';
import { KeycloakConfigModule } from '../../keycloak-administration/keycloak-config.module.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonenKontextApiModule } from '../personenkontext-api.module.js';
import { FindRollenResponse } from './response/find-rollen.response.js';

describe('PersonAdministrationController Integration Test', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let rolleRepo: RolleRepo;
    let organisationRepo: OrganisationRepository;
    let personpermissionsRepoMock: DeepMocked<PersonPermissionsRepo>;
    let personPermissionsMock: DeepMocked<PersonPermissions>;

    beforeAll(async () => {
        personpermissionsRepoMock = {
            loadPersonPermissions: vi.fn(),
        } as DeepMocked<PersonPermissionsRepo>;
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                PersonenKontextApiModule,
                KeycloakAdministrationModule,
            ],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                {
                    provide: PersonPermissionsRepo,
                    useValue: personpermissionsRepoMock,
                },
                {
                    provide: APP_INTERCEPTOR,
                    useValue: {
                        intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
                            const req: Request = context.switchToHttp().getRequest();
                            req.passportUser = createPassportUserMock(personPermissionsMock);
                            return next.handle();
                        },
                    },
                },
            ],
        })
            .overrideModule(KeycloakConfigModule)
            .useModule(KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true }))
            .compile();

        orm = module.get(MikroORM);
        rolleRepo = module.get(RolleRepo);
        organisationRepo = module.get(OrganisationRepository);
        personpermissionsRepoMock = module.get(PersonPermissionsRepo);
        personPermissionsMock = createPersonPermissionsMock();
        personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

        await DatabaseTestModule.setupDatabase(orm);
        app = module.createNestApplication();
        await app.init();
    }, 10000000);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    describe('/GET rollen for personenkontext', () => {
        it('should return all rollen for a logged-in user without filter, if the user is Landesadmin', async () => {
            const rolleName: string = faker.string.alpha({ length: 10 });
            await rolleRepo.save(DoFactory.createRolle(false, { name: rolleName, rollenart: RollenArt.SYSADMIN }));
            const schuladminRolleName: string = faker.string.alpha({ length: 10 });
            await rolleRepo.save(
                DoFactory.createRolle(false, { name: schuladminRolleName, rollenart: RollenArt.LEIT }),
            );

            const response: Response = await request(app.getHttpServer() as App)
                .get('/person-administration/rollen')
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
            expect(response.body).toEqual(
                expect.objectContaining({
                    total: 2,
                }) as FindRollenResponse,
            );
        });

        it('should return all rollen for a logged-in user based on search filter', async () => {
            const rolleName: string = faker.string.alpha({ length: 10 });
            await rolleRepo.save(DoFactory.createRolle(false, { name: rolleName }));
            const response: Response = await request(app.getHttpServer() as App)
                .get(`/person-administration/rollen?rolleName=${rolleName}&limit=25`)
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
        });

        it('should return empty list, if rollen do not exist', async () => {
            const response: Response = await request(app.getHttpServer() as App)
                .get(`/person-administration/rollen?rolleName=${faker.string.alpha()}&limit=25`)
                .send();

            expect(response.status).toBe(200);
            expect(response.body).toBeInstanceOf(Object);
        });

        describe('when user is traegeradmin', () => {
            it('should return rollen for permitted organisationen', async () => {
                const rolleName: string = faker.string.alpha({ length: 10 });
                const parentOrga: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.TRAEGER }),
                );
                const orga: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, {
                        administriertVon: parentOrga.id,
                        typ: OrganisationsTyp.SCHULE,
                    }),
                );
                await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        name: rolleName,
                        rollenart: RollenArt.LEIT,
                        administeredBySchulstrukturknoten: parentOrga.id,
                    }),
                );
                await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        name: rolleName,
                        rollenart: RollenArt.LEIT,
                        administeredBySchulstrukturknoten: orga.id,
                    }),
                );
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [parentOrga.id, orga.id],
                });
                personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(personPermissionsMock);
                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/person-administration/rollen?rolleName=${rolleName}&limit=25`)
                    .send();

                expect(response.status).toBe(200);
                expect(response.body).toBeInstanceOf(Object);
                expect(response.body).toEqual(
                    expect.objectContaining({
                        total: 2,
                    }) as FindRollenResponse,
                );
            });
        });

        describe('when user is schuladmin', () => {
            it('should return rollen for permitted organisationen', async () => {
                const rolleName: string = faker.string.alpha({ length: 10 });
                const parentOrga: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.TRAEGER }),
                );
                const orga: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, {
                        administriertVon: parentOrga.id,
                        typ: OrganisationsTyp.SCHULE,
                    }),
                );
                await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        name: rolleName,
                        rollenart: RollenArt.LEIT,
                        administeredBySchulstrukturknoten: parentOrga.id,
                    }),
                );
                await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        name: rolleName,
                        rollenart: RollenArt.LEIT,
                        administeredBySchulstrukturknoten: orga.id,
                    }),
                );
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [orga.id],
                });
                personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(personPermissionsMock);
                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/person-administration/rollen?rolleName=${rolleName}&limit=25&organisationIds=${orga.id}`)
                    .send();

                expect(response.status).toBe(200);
                expect(response.body).toBeInstanceOf(Object);
                expect(response.body).toEqual(
                    expect.objectContaining({
                        total: 2,
                    }) as FindRollenResponse,
                );
            });

            it('should not return rollen when they dont match the provided organisation', async () => {
                const rolleName: string = faker.string.alpha({ length: 10 });
                const orga: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                );
                await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        name: rolleName,
                        rollenart: RollenArt.SYSADMIN,
                        administeredBySchulstrukturknoten: orga.id,
                    }),
                ); // does not match typ
                await rolleRepo.save(DoFactory.createRolle(false, { name: rolleName, rollenart: RollenArt.LEIT })); // does not match orga node
                personPermissionsMock.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [orga.id],
                });
                personpermissionsRepoMock.loadPersonPermissions.mockResolvedValue(personPermissionsMock);
                const response: Response = await request(app.getHttpServer() as App)
                    .get(`/person-administration/rollen?rolleName=${rolleName}&limit=25&organisationIds=${orga.id}`)
                    .send();

                expect(response.status).toBe(200);
                expect(response.body).toBeInstanceOf(Object);
                expect(response.body).toEqual(
                    expect.objectContaining({
                        total: 0,
                    }) as FindRollenResponse,
                );
            });
        });
    });
});
