import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import request, { type Response } from 'supertest';
import { type App } from 'supertest/types.js';

import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import {
    createAuthInterceptorMock,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
    KeycloakConfigTestModule,
} from '../../../../test/utils/index.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { DuplicatePersonalnummerError } from '../../../shared/error/duplicate-personalnummer.error.js';
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../shared/filter/validation-exception-filter.js';
import { type OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { GlobalValidationPipe } from '../../../shared/validation/index.js';
import { AuthenticationExceptionFilter } from '../../authentication/api/authentication-exception-filter.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { KeycloakAdministrationModule } from '../../keycloak-administration/keycloak-administration.module.js';
import { KeycloakConfigModule } from '../../keycloak-administration/keycloak-config.module.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { type EscalatedPersonPermissions } from '../../permission/escalated-person-permissions.js';
import { RollenArt, RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RollenmerkmalSystemrechtPaar } from '../../rolle/domain/rollenmerkmal-systemrecht-paar.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonenkontexteUpdateError } from '../domain/error/personenkontexte-update.error.js';
import { PersonenkontextCreationService } from '../domain/personenkontext-creation.service.js';
import { OperationContext } from '../domain/personenkontext.enums.js';
import { PersonenKontextApiModule } from '../personenkontext-api.module.js';

describe('DbiamPersonenkontextWorkflowController Integration Test', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let organisationRepo: OrganisationRepository;
    let rolleRepo: RolleRepo;
    let personPermissionsMock: DeepMocked<PersonPermissions>;
    let escalatedPersonPermissionsMock: DeepMocked<PersonPermissions>;
    let personenkontextService: PersonenkontextCreationService;
    let escalatedPersonPermissionsFactoryMock: DeepMocked<EscalatedPersonPermissionsFactory>;

    beforeAll(async () => {
        personPermissionsMock = createPersonPermissionsMock();
        escalatedPersonPermissionsMock = createPersonPermissionsMock();
        escalatedPersonPermissionsFactoryMock = createMock(EscalatedPersonPermissionsFactory);

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
                { provide: APP_FILTER, useClass: ValidationExceptionFilter },
                { provide: APP_FILTER, useClass: AuthenticationExceptionFilter },
                { provide: APP_FILTER, useClass: SharedExceptionFilter },
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
                {
                    provide: APP_INTERCEPTOR,
                    useValue: createAuthInterceptorMock(personPermissionsMock),
                },
            ],
        })
            .overrideModule(KeycloakConfigModule)
            .useModule(KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true }))
            .overrideProvider(EscalatedPersonPermissionsFactory)
            .useValue(escalatedPersonPermissionsFactoryMock)
            .compile();

        const stepUpGuard: StepUpGuard = module.get(StepUpGuard);
        stepUpGuard.canActivate = vi.fn().mockReturnValue(true);

        orm = module.get(MikroORM);
        organisationRepo = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        personenkontextService = module.get(PersonenkontextCreationService);
        await DatabaseTestModule.setupDatabase(orm);
        app = module.createNestApplication();
        await app.init();
        escalatedPersonPermissionsFactoryMock.fromPermissions.mockResolvedValue(
            escalatedPersonPermissionsMock as unknown as EscalatedPersonPermissions,
        );
    }, 10000000);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    describe('/POST create person with personenkontexte', () => {
        it('should return created person and personenkontexte', async () => {
            const schule: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const klasse: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.KLASSE, administriertVon: schule.id }),
            );
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: schule.id,
                    rollenart: RollenArt.LERN,
                    merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
            escalatedPersonPermissionsMock.canModifyPerson.mockResolvedValue(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    createPersonenkontexte: [
                        {
                            organisationId: schule.id,
                            rolleId: rolle.id,
                        },
                        {
                            organisationId: klasse.id,
                            rolleId: rolle.id,
                        },
                    ],
                });
            expect(response.status).toBe(201);
        });

        it('should return created person and personenkontext with personalnummer', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.LEHR,
                    merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
            escalatedPersonPermissionsMock.canModifyPerson.mockResolvedValue(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    createPersonenkontexte: [
                        {
                            organisationId: organisation.id,
                            rolleId: rolle.id,
                        },
                    ],
                    personalnummer: '1234567',
                });
            expect(response.status).toBe(201);
        });

        it('should return error with status-code=404 if organisation does NOT exist', async () => {
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: faker.string.uuid(),
                    rollenart: RollenArt.LEHR,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            personPermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(false);
            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
            escalatedPersonPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    createPersonenkontexte: [
                        {
                            organisationId: faker.string.uuid(),
                            rolleId: rolle.id,
                        },
                    ],
                });

            expect(response.status).toBe(404);
        });

        it('should return error with status-code 400 if specification ROLLE_NUR_AN_PASSENDE_ORGANISATION is NOT satisfied', async () => {
            const organisation: Organisation<true> = await organisationRepo.save(
                DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
            );
            const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                DoFactory.createRolle(false, {
                    administeredBySchulstrukturknoten: organisation.id,
                    rollenart: RollenArt.SYSADMIN,
                }),
            );
            if (rolle instanceof DomainError) {
                throw Error();
            }

            personPermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(false);
            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    createPersonenkontexte: [
                        {
                            organisationId: organisation.id,
                            rolleId: rolle.id,
                        },
                    ],
                });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                code: 400,
                i18nKey: 'ROLLE_NUR_AN_PASSENDE_ORGANISATION',
            });
        });

        it('should return error with status-code 404 if user does NOT have permissions', async () => {
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

            personPermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);
            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    createPersonenkontexte: [
                        {
                            organisationId: organisation.id,
                            rolleId: rolle.id,
                        },
                    ],
                });
            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                code: 404,
                i18nKey: 'MISSING_PERMISSIONS',
            });
        });
        it('should return error with status-code 400 if DuplicatePersonalnummerError is thrown', async () => {
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

            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            // Mock the service to throw DuplicatePersonalnummerError
            vi.spyOn(personenkontextService, 'createPersonWithPersonenkontexte').mockResolvedValueOnce({
                ok: false,
                error: new DuplicatePersonalnummerError('Duplicate Kopers'),
            });

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    organisationId: organisation.id,
                    rolleId: rolle.id,
                    personalnummer: '1234567',
                    createPersonenkontexte: [
                        {
                            organisationId: organisation.id,
                            rolleId: rolle.id,
                        },
                    ],
                });

            expect(response.status).toBe(400);
        });
        it('should return error with status-code 400 if PersonenkontexteUpdateError is thrown', async () => {
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

            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            // Mock the service to throw DuplicatePersonalnummerError
            vi.spyOn(personenkontextService, 'createPersonWithPersonenkontexte').mockResolvedValueOnce({
                ok: false,
                error: new PersonenkontexteUpdateError('Error'),
            });

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    createPersonenkontexte: [
                        {
                            organisationId: organisation.id,
                            rolleId: rolle.id,
                        },
                    ],
                    personalnummer: '1234567',
                });

            expect(response.status).toBe(400);
        });
        it('should return error with status-code 400 if PersonenkontexteUpdateError is thrown', async () => {
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

            personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            // Mock the service to throw DuplicatePersonalnummerError
            vi.spyOn(personenkontextService, 'createPersonWithPersonenkontexte').mockResolvedValueOnce({
                ok: false,
                error: new PersonenkontexteUpdateError('Error'),
            });

            const response: Response = await request(app.getHttpServer() as App)
                .post('/personenkontext-workflow')
                .send({
                    familienname: faker.person.lastName(),
                    vorname: faker.person.firstName(),
                    createPersonenkontexte: [
                        {
                            organisationId: organisation.id,
                            rolleId: rolle.id,
                        },
                    ],
                    personalnummer: '1234567',
                });

            expect(response.status).toBe(400);
        });

        describe(`when user has only ${RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN.name}`, () => {
            let schule: Organisation<true>;
            let klasse: Organisation<true>;

            async function postPersonWithRolle(merkmale: RollenMerkmal[], rollenart: RollenArt): Promise<Response> {
                const rolle: Rolle<true> = await rolleRepo.create(
                    DoFactory.createRolle(false, {
                        administeredBySchulstrukturknoten: schule.id,
                        rollenart,
                        merkmale,
                    }),
                );

                return request(app.getHttpServer() as App)
                    .post('/personenkontext-workflow')
                    .send({
                        familienname: faker.person.lastName(),
                        vorname: faker.person.firstName(),
                        createPersonenkontexte: [
                            { organisationId: schule.id, rolleId: rolle.id },
                            { organisationId: klasse.id, rolleId: rolle.id },
                        ],
                    });
            }

            beforeEach(async () => {
                schule = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                );
                klasse = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.KLASSE, administriertVon: schule.id }),
                );
                personPermissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(
                    Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                );
                personPermissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                    (orgaId: OrganisationID, systemrecht: RollenSystemRecht) =>
                        Promise.resolve(
                            (orgaId === schule.id || orgaId === klasse.id) &&
                                systemrecht !== RollenSystemRecht.PERSONEN_ANLEGEN,
                        ),
                );
                escalatedPersonPermissionsMock.canModifyPerson.mockResolvedValue(true);
            });

            afterEach(() => {
                personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
            });

            it('should create the person for a role whose Rollenart is in the allowlist', async () => {
                const response: Response = await postPersonWithRolle([], RollenArt.LERN);

                expect(response.status).toBe(201);
            });

            it('should reject a Pilot-only role whose Rollenart is not in the allowlist', async () => {
                const response: Response = await postPersonWithRolle([RollenMerkmal.PILOT_1_ROLLE], RollenArt.LEHR);

                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    code: 404,
                    i18nKey: 'MISSING_PERMISSIONS',
                });
            });

            it('should reject a role without gated Merkmale whose Rollenart is not in the allowlist', async () => {
                const response: Response = await postPersonWithRolle([], RollenArt.LEHR);

                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    code: 404,
                    i18nKey: 'MISSING_PERMISSIONS',
                });
            });
        });
    });

    it('does not expose the former workflow prevalidation route', async () => {
        await request(app.getHttpServer() as App)
            .get('/personenkontext-workflow/step')
            .expect(404);
    });

    it('does not expose the legacy PUT route', async () => {
        const response: Response = await request(app.getHttpServer() as App)
            .put(`/personenkontext-workflow/${faker.string.uuid()}`)
            .send({ count: 0, personenkontexte: [], operationContext: OperationContext.PERSON_BEARBEITEN });

        expect(response.status).toBe(404);
    });
});
