import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import request, { type Response, type Test as SupertestRequest } from 'supertest';
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
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../shared/filter/validation-exception-filter.js';
import { type OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { generatePassword } from '../../../shared/util/password-generator.js';
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
import { PersonFactory } from '../../person/domain/person.factory.js';
import { type Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { RollenArt, RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RollenmerkmalSystemrechtPaar } from '../../rolle/domain/rollenmerkmal-systemrecht-paar.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DBiamPersonenkontextRepoInternal } from '../persistence/internal-dbiam-personenkontext.repo.js';
import { PersonenKontextApiModule } from '../personenkontext-api.module.js';
import { type PersonenzuordnungenBearbeitenBodyParams } from './param/personenzuordnungen-bearbeiten.body.params.js';

describe('PersonenkontextController Integration Test', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let organisationRepo: OrganisationRepository;
    let rolleRepo: RolleRepo;
    let personPermissionsMock: DeepMocked<PersonPermissions>;
    let escalatedPersonPermissionsMock: DeepMocked<PersonPermissions>;
    let personRepo: PersonRepository;
    let personenkontextRepoInternal: DBiamPersonenkontextRepoInternal;
    let personFactory: PersonFactory;
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
        personRepo = module.get(PersonRepository);
        personenkontextRepoInternal = module.get(DBiamPersonenkontextRepoInternal);
        personFactory = module.get(PersonFactory);
        await DatabaseTestModule.setupDatabase(orm);
        app = module.createNestApplication();
        await app.init();
        escalatedPersonPermissionsFactoryMock.fromPermissions.mockResolvedValue(
            escalatedPersonPermissionsMock as unknown as EscalatedPersonPermissions,
        );
    }, 10000000);

    async function createPerson(personalnummer?: string): Promise<Person<true>> {
        const personResult: Person<false> | DomainError = await personFactory.createNew({
            vorname: faker.person.firstName(),
            familienname: faker.person.lastName(),
            username: faker.internet.username(),
            password: generatePassword(),
            personalnummer,
        });
        if (personResult instanceof DomainError) {
            throw personResult;
        }
        const person: Person<true> | DomainError = await personRepo.create(personResult);
        if (person instanceof DomainError) {
            throw person;
        }

        return person;
    }

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    let person: Person<true>;
    let existing: Personenkontext<true>;
    let newRole: Rolle<true>;
    let url: string;
    let landesbedienstetenzuordnungenUrl: string;

    async function createExistingZuordnung(personalnummer: string | null = '1234567'): Promise<void> {
        person = await createPerson(personalnummer ?? undefined);
        const organisation: Organisation<true> = await organisationRepo.save(
            DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
        );
        const existingRole: Rolle<true> = await rolleRepo.create(
            DoFactory.createRolle(false, { rollenart: RollenArt.LEHR, merkmale: [] }),
        );
        newRole = await rolleRepo.create(
            DoFactory.createRolle(false, {
                rollenart: RollenArt.LEHR,
                merkmale: [],
                administeredBySchulstrukturknoten: organisation.id,
            }),
        );
        existing = await personenkontextRepoInternal.save(
            DoFactory.createPersonenkontext(false, {
                personId: person.id,
                organisationId: organisation.id,
                rolleId: existingRole.id,
                befristung: undefined,
            }),
        );
        url = `/personenkontexte/person/${person.id}`;
        landesbedienstetenzuordnungenUrl = `${url}/landesbedienstetenzuordnungen`;
    }

    async function expectRejectedWithoutChanges(updateRequest: SupertestRequest): Promise<void> {
        const otherSchool: Organisation<true> = await organisationRepo.save(
            DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
        );
        const unrelatedRole: Rolle<true> = await rolleRepo.create(
            DoFactory.createRolle(false, {
                rollenart: RollenArt.LEHR,
                merkmale: [],
                administeredBySchulstrukturknoten: otherSchool.id,
            }),
        );
        const response: Response = await updateRequest.query({ personalnummer: '7654321' }).send({
            count: 1,
            lastModified: existing.updatedAt,
            personenkontexte: [
                { organisationId: existing.organisationId, rolleId: newRole.id },
                { organisationId: existing.organisationId, rolleId: unrelatedRole.id },
            ],
        });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ code: 404, i18nKey: 'ENTITY_NOT_FOUND' });
        const persisted: Personenkontext<true>[] = await app.get(DBiamPersonenkontextRepo).findByPerson(person.id);
        expect(persisted.map((pk: Personenkontext<true>) => pk.id)).toEqual([existing.id]);
        expect((await personRepo.findById(person.id))?.personalnummer).toBe(person.personalnummer);
    }

    describe('POST /personenkontexte/person/:personId/landesbedienstetenzuordnungen', () => {
        describe('when the target person is not eligible for Landesbedienstete assignment', () => {
            async function setup(): Promise<PersonenzuordnungenBearbeitenBodyParams> {
                await createExistingZuordnung(null);
                return {
                    count: 1,
                    lastModified: existing.updatedAt,
                    personenkontexte: [{ organisationId: existing.organisationId, rolleId: newRole.id }],
                };
            }

            it('returns the search error and leaves the existing Zuordnung unchanged', async () => {
                const body: PersonenzuordnungenBearbeitenBodyParams = await setup();

                const response: Response = await request(app.getHttpServer() as App)
                    .post(landesbedienstetenzuordnungenUrl)
                    .query({ personalnummer: '7654321' })
                    .send(body);

                expect(response.status).toBe(400);
                expect(response.body).toEqual({ code: 400, i18nKey: 'LANDESBEDIENSTETER_SEARCH_NO_PERSON_FOUND' });
                expect(await app.get(DBiamPersonenkontextRepo).findByPerson(person.id)).toEqual([existing]);
                expect((await personRepo.findById(person.id))?.personalnummer).toBe(person.personalnummer);
            });
        });

        describe('when lastModified is not a date', () => {
            async function setup(): Promise<void> {
                await createExistingZuordnung();
            }

            it('returns a validation error without adding a Zuordnung', async () => {
                await setup();

                const response: Response = await request(app.getHttpServer() as App)
                    .post(landesbedienstetenzuordnungenUrl)
                    .send({
                        count: 1,
                        lastModified: 'not-a-date',
                        personenkontexte: [{ organisationId: existing.organisationId, rolleId: newRole.id }],
                    });

                expect(response.status).toBe(400);
                expect(response.body).toEqual({ code: 400, i18nKey: 'INVALID_DATE' });
                expect(await app.get(DBiamPersonenkontextRepo).findByPerson(person.id)).toEqual([existing]);
            });
        });

        it('preserves existing assignments when adding a Zuordnung', async () => {
            await createExistingZuordnung();
            const response: Response = await request(app.getHttpServer() as App)
                .post(landesbedienstetenzuordnungenUrl)
                .send({
                    count: 1,
                    lastModified: existing.updatedAt,
                    personenkontexte: [{ organisationId: existing.organisationId, rolleId: newRole.id }],
                });

            expect(response.status).toBe(201);
            const persisted: Personenkontext<true>[] = await app.get(DBiamPersonenkontextRepo).findByPerson(person.id);
            expect(persisted.map((pk: Personenkontext<true>) => pk.rolleId).sort()).toEqual(
                [existing.rolleId, newRole.id].sort(),
            );
            expect(persisted.find((pk: Personenkontext<true>) => pk.id === existing.id)?.updatedAt).toEqual(
                existing.updatedAt,
            );
        });

        describe('when a new Zuordnung is outside the role scope', () => {
            it('rejects the request without writing any changes', async () => {
                await createExistingZuordnung();
                await expectRejectedWithoutChanges(
                    request(app.getHttpServer() as App).post(landesbedienstetenzuordnungenUrl),
                );
            });
        });

        it('rejects additions based on an outdated assignment count', async () => {
            await createExistingZuordnung();
            const response: Response = await request(app.getHttpServer() as App)
                .post(landesbedienstetenzuordnungenUrl)
                .send({
                    count: 0,
                    personenkontexte: [{ organisationId: existing.organisationId, rolleId: newRole.id }],
                });

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ code: 400, i18nKey: 'COUNT_MISMATCHING' });
        });

        it('rejects the Landesbedienstete POST without its dedicated permission', async () => {
            await createExistingZuordnung();
            personPermissionsMock.hasSystemrechteAtOrganisation.mockResolvedValueOnce(false);
            const response: Response = await request(app.getHttpServer() as App)
                .post(landesbedienstetenzuordnungenUrl)
                .send({
                    count: 1,
                    lastModified: existing.updatedAt,
                    personenkontexte: [{ organisationId: existing.organisationId, rolleId: newRole.id }],
                });

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ code: 404, i18nKey: 'MISSING_PERMISSIONS' });
        });

        it('rejects an empty POST instead of treating it as a replacement', async () => {
            await createExistingZuordnung();
            const response: Response = await request(app.getHttpServer() as App)
                .post(landesbedienstetenzuordnungenUrl)
                .send({ count: 1, lastModified: existing.updatedAt, personenkontexte: [] });

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /personenkontexte/person/:personId', () => {
        describe('when the caller cannot modify the target person', () => {
            async function setup(): Promise<PersonenzuordnungenBearbeitenBodyParams> {
                await createExistingZuordnung();
                personPermissionsMock.canModifyPerson.mockResolvedValueOnce(false);
                return {
                    count: 1,
                    lastModified: existing.updatedAt,
                    personenkontexte: [{ organisationId: existing.organisationId, rolleId: newRole.id }],
                };
            }

            it('returns the permission error without replacing the existing Zuordnung', async () => {
                const body: PersonenzuordnungenBearbeitenBodyParams = await setup();

                const response: Response = await request(app.getHttpServer() as App)
                    .put(url)
                    .query({ personalnummer: '7654321' })
                    .send(body);

                expect(response.status).toBe(404);
                expect(response.body).toEqual({ code: 404, i18nKey: 'MISSING_PERMISSIONS' });
                expect(await app.get(DBiamPersonenkontextRepo).findByPerson(person.id)).toEqual([existing]);
                expect((await personRepo.findById(person.id))?.personalnummer).toBe(person.personalnummer);
            });
        });

        describe('when the Zuordnung snapshot is outdated but the count still matches', () => {
            async function setup(): Promise<PersonenzuordnungenBearbeitenBodyParams> {
                await createExistingZuordnung();
                return {
                    count: 1,
                    lastModified: new Date(existing.updatedAt.getTime() - 60_000),
                    personenkontexte: [],
                };
            }

            it('returns the snapshot error without removing the existing Zuordnung', async () => {
                const body: PersonenzuordnungenBearbeitenBodyParams = await setup();

                const response: Response = await request(app.getHttpServer() as App)
                    .put(url)
                    .send(body);

                expect(response.status).toBe(400);
                expect(response.body).toEqual({
                    code: 400,
                    i18nKey: 'NEWER_VERSION_OF_PERSONENKONTEXTE_AVAILABLE',
                });
                expect(await app.get(DBiamPersonenkontextRepo).findByPerson(person.id)).toEqual([existing]);
            });
        });

        describe('with an existing Zuordnung', () => {
            it('replaces the full assignment set, including removal of the final assignment', async () => {
                await createExistingZuordnung();
                const response: Response = await request(app.getHttpServer() as App)
                    .put(url)
                    .send({ count: 1, lastModified: existing.updatedAt, personenkontexte: [] });

                expect(response.status).toBe(200);
                expect(response.body).toEqual({ dBiamPersonenkontextResponses: [] });
                expect(await app.get(DBiamPersonenkontextRepo).findByPerson(person.id)).toEqual([]);
            });

            it('adds a regular assignment and saves the supplied personalnummer', async () => {
                await createExistingZuordnung();
                const personalnummer: string = '7654321';
                const response: Response = await request(app.getHttpServer() as App)
                    .put(url)
                    .query({ personalnummer })
                    .send({
                        count: 1,
                        lastModified: existing.updatedAt,
                        personenkontexte: [
                            { organisationId: existing.organisationId, rolleId: existing.rolleId },
                            { organisationId: existing.organisationId, rolleId: newRole.id },
                        ],
                    });

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty(
                    'dBiamPersonenkontextResponses',
                    expect.arrayContaining([
                        expect.objectContaining({ personId: person.id, rolleId: existing.rolleId }),
                        expect.objectContaining({ personId: person.id, rolleId: newRole.id }),
                    ]),
                );
                expect((await personRepo.findById(person.id))?.personalnummer).toBe(personalnummer);
            });

            describe('when a new Zuordnung is outside the role scope', () => {
                it('rejects the request without writing any changes', async () => {
                    await createExistingZuordnung();
                    await expectRejectedWithoutChanges(request(app.getHttpServer() as App).put(url));
                });
            });
        });
        describe('MPT permissions', () => {
            afterEach(() => {
                personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
                personPermissionsMock.getPermittedMerkmaleForOrga.mockResolvedValue(
                    Array.from(RollenmerkmalSystemrechtPaar.GATED_MERKMALE),
                );
            });

            it.each([
                { operation: 'add', allowed: false },
                { operation: 'remove', allowed: false },
                { operation: 'add', allowed: true },
                { operation: 'remove', allowed: true },
            ])(
                'should enforce MPT permissions for $operation with allowed=$allowed',
                async ({ operation, allowed }: { operation: string; allowed: boolean }) => {
                    const person: Person<true> = await createPerson();
                    const organisation: Organisation<true> = await organisationRepo.save(
                        DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                    );
                    const regularRolle: Rolle<true> = await rolleRepo.create(
                        DoFactory.createRolle(false, {
                            rollenart: RollenArt.LEHR,
                            merkmale: [],
                            serviceProviderIds: [],
                        }),
                    );
                    const mptRolle: Rolle<true> = await rolleRepo.create(
                        DoFactory.createRolle(false, {
                            rollenart: RollenArt.LEHR,
                            merkmale: [RollenMerkmal.MPT_ROLLE],
                            serviceProviderIds: [],
                            administeredBySchulstrukturknoten: organisation.id,
                        }),
                    );
                    const regularPK: Personenkontext<true> = await personenkontextRepoInternal.save(
                        DoFactory.createPersonenkontext(false, {
                            personId: person.id,
                            organisationId: organisation.id,
                            rolleId: regularRolle.id,
                            befristung: undefined,
                        }),
                    );
                    let lastModified: Date = regularPK.updatedAt;
                    if (operation === 'remove') {
                        const mptPK: Personenkontext<true> = await personenkontextRepoInternal.save(
                            DoFactory.createPersonenkontext(false, {
                                personId: person.id,
                                organisationId: organisation.id,
                                rolleId: mptRolle.id,
                                befristung: undefined,
                            }),
                        );
                        lastModified = mptPK.updatedAt;
                    }
                    const sentRollen: Rolle<true>[] = operation === 'add' ? [regularRolle, mptRolle] : [regularRolle];
                    const body: PersonenzuordnungenBearbeitenBodyParams = {
                        count: operation === 'add' ? 1 : 2,
                        lastModified,
                        personenkontexte: sentRollen.map((rolle: Rolle<true>) => ({
                            organisationId: organisation.id,
                            rolleId: rolle.id,
                        })),
                    };
                    personPermissionsMock.canModifyPerson.mockResolvedValue(true);
                    personPermissionsMock.getPermittedMerkmaleForOrga.mockImplementation(
                        (organisationId: OrganisationID) =>
                            Promise.resolve(
                                allowed && organisationId === organisation.id ? [RollenMerkmal.MPT_ROLLE] : [],
                            ),
                    );
                    personPermissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                        (organisationId: string, systemrecht: RollenSystemRecht): Promise<boolean> =>
                            Promise.resolve(
                                systemrecht !== RollenSystemRecht.MPT_ROLLEN_ZUORDNEN ||
                                    (allowed && organisationId === organisation.id),
                            ),
                    );

                    const response: Response = await request(app.getHttpServer() as App)
                        .put(`/personenkontexte/person/${person.id}`)
                        .send(body);

                    expect(response.status).toBe(allowed ? 200 : 404);
                    if (!allowed) {
                        expect(response.body).toEqual({ code: 404, i18nKey: 'MISSING_PERMISSIONS' });
                    }
                    const persisted: Personenkontext<true>[] = await app
                        .get(DBiamPersonenkontextRepo)
                        .findByPerson(person.id);
                    const expectedRollen: Rolle<true>[] = allowed
                        ? sentRollen
                        : operation === 'add'
                          ? [regularRolle]
                          : [regularRolle, mptRolle];
                    expect(persisted.map((pk: Personenkontext<true>) => pk.rolleId).sort()).toEqual(
                        expectedRollen.map((rolle: Rolle<true>) => rolle.id).sort(),
                    );
                },
            );
        });

        describe('when errors occur', () => {
            it('should return error because the count is not matching', async () => {
                const person: Person<true> = await createPerson();
                const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
                if (rolle instanceof DomainError) {
                    throw rolle;
                }
                const organisation: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                const savedPK: Personenkontext<true> = await personenkontextRepoInternal.save(
                    DoFactory.createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: organisation.id,
                        updatedAt: new Date(),
                    }),
                );
                const updatePKsRequest: PersonenzuordnungenBearbeitenBodyParams = {
                    count: 0,
                    lastModified: savedPK.updatedAt,
                    personenkontexte: [],
                };

                const response: Response = await request(app.getHttpServer() as App)
                    .put(`/personenkontexte/person/${person.id}`)
                    .send(updatePKsRequest);

                expect(response.status).toBe(400);
            });
        });

        describe('for Person with a PK rolle with rollenart LERN', () => {
            it('should return error with status-code 400, if the new PK rolle is not rollenart LERN', async () => {
                const schueler: Person<true> = await createPerson();
                const schule: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                );
                const lernRolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, { rollenart: RollenArt.LERN, systemrechte: [] }),
                );
                if (lernRolle instanceof DomainError) {
                    throw Error();
                }

                const savedPK: Personenkontext<true> = await personenkontextRepoInternal.save(
                    DoFactory.createPersonenkontext(false, {
                        personId: schueler.id,
                        rolleId: lernRolle.id,
                        organisationId: schule.id,
                        updatedAt: new Date(),
                    }),
                );

                const lehrerRolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, {
                        rollenart: RollenArt.LEHR,
                        systemrechte: [RollenSystemRecht.KLASSEN_VERWALTEN],
                    }),
                );
                if (lehrerRolle instanceof DomainError) {
                    throw Error();
                }

                const updatePKsRequest: PersonenzuordnungenBearbeitenBodyParams = {
                    count: 1,
                    lastModified: savedPK.updatedAt,
                    personenkontexte: [
                        {
                            rolleId: lernRolle.id,
                            organisationId: schule.id,
                        },
                        {
                            rolleId: lehrerRolle.id,
                            organisationId: schule.id,
                        },
                    ],
                };

                personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);
                personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

                const response: Response = await request(app.getHttpServer() as App)
                    .put(`/personenkontexte/person/${schueler.id}`)
                    .send(updatePKsRequest);

                expect(response.status).toBe(400);
                expect(response.body).toEqual({
                    code: 400,
                    i18nKey: 'INVALID_PERSONENKONTEXT_FOR_PERSON_WITH_ROLLENART_LERN',
                });
            });
        });

        describe('when duplicate personalnummer error occurs', () => {
            it('should return error with status-code 400 for duplicate personalnummer', async () => {
                const personalnummer: string = '1234567';
                await createPerson(personalnummer);
                const person: Person<true> = await createPerson();
                const orga: Organisation<true> = await organisationRepo.save(DoFactory.createOrganisation(false));
                const rolle: Rolle<true> | DomainError = await rolleRepo.save(
                    DoFactory.createRolle(false, { systemrechte: [RollenSystemRecht.PERSONEN_VERWALTEN] }),
                );
                if (rolle instanceof DomainError) {
                    throw Error();
                }

                const savedPK: Personenkontext<true> = await personenkontextRepoInternal.save(
                    DoFactory.createPersonenkontext(false, {
                        personId: person.id,
                        rolleId: rolle.id,
                        organisationId: orga.id,
                        updatedAt: new Date(),
                    }),
                );

                const updatePKsRequest: PersonenzuordnungenBearbeitenBodyParams = {
                    count: 1,
                    lastModified: savedPK.updatedAt,
                    personenkontexte: [
                        {
                            rolleId: rolle.id,
                            organisationId: orga.id,
                        },
                    ],
                };

                personPermissionsMock.canModifyPerson.mockResolvedValueOnce(true);
                personPermissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);

                const response: Response = await request(app.getHttpServer() as App)
                    .put(`/personenkontexte/person/${person.id}`)
                    .query({ personalnummer })
                    .send(updatePKsRequest);

                expect(response.status).toBe(400);
                expect(response.body).toEqual({
                    code: 400,
                    i18nKey: 'PERSONALNUMMER_NICHT_EINDEUTIG',
                });
            });
        });
    });
});
