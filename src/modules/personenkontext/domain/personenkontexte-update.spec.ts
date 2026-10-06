import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { faker } from '@faker-js/faker';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DBiamPersonenkontextRepoInternal } from '../persistence/internal-dbiam-personenkontext.repo.js';
import { PersonenkontexteUpdate } from './personenkontexte-update.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { PersonID } from '../../../shared/types/index.js';
import { DbiamPersonenkontextBodyParams } from '../api/param/dbiam-personenkontext.body.params.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { UpdatePersonIdMismatchError } from './error/update-person-id-mismatch.error.js';
import { Personenkontext } from './personenkontext.js';
import { UpdateCountError } from './error/update-count.error.js';
import { UpdateOutdatedError } from './error/update-outdated.error.js';
import { PersonenkontexteUpdateError } from './error/personenkontexte-update.error.js';
import { PersonenkontextFactory } from './personenkontext.factory.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { UpdatePersonNotFoundError } from './error/update-person-not-found.error.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DoFactory,
    PersonPermissionsMock,
} from '../../../../test/utils/index.js';
import { Person } from '../../person/domain/person.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenArt, RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RollenmerkmalSystemrechtPaar } from '../../rolle/domain/rollenmerkmal-systemrecht-paar.js';
import { UpdateInvalidRollenartForLernError } from './error/update-invalid-rollenart-for-lern.error.js';
import { PersonenkontextBefristungRequiredError } from './error/personenkontext-befristung-required.error.js';
import { CheckBefristungSpecification } from '../specification/befristung-required-bei-rolle-befristungspflicht.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { DuplicatePersonalnummerError } from '../../../shared/error/duplicate-personalnummer.error.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { DuplicateKlassenkontextError } from './error/update-invalid-duplicate-klassenkontext-for-same-rolle.js';
import { UpdateLernNotAtSchuleAndKlasseError } from './error/update-lern-not-at-schule-and-klasse.error.js';
import { EmailPersistenceModule } from '../../email/email-persistence.module.js';
import { EmailMicroserviceModule } from '../../email-microservice/email-microservice.module.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';

function createPKBodyParams(personId: PersonID): DbiamPersonenkontextBodyParams[] {
    const firstCreatePKBodyParams: DbiamPersonenkontextBodyParams = createMock<DbiamPersonenkontextBodyParams>(
        DbiamPersonenkontextBodyParams,
        {
            personId: personId,
            organisationId: faker.string.uuid(),
            rolleId: faker.string.uuid(),
            befristung: faker.date.future(),
        },
    );

    const secondCreatePKBodyParams: DbiamPersonenkontextBodyParams = createMock<DbiamPersonenkontextBodyParams>(
        DbiamPersonenkontextBodyParams,
        {
            personId: personId,
            organisationId: faker.string.uuid(),
            rolleId: faker.string.uuid(),
            befristung: faker.date.future(),
        },
    );

    return [firstCreatePKBodyParams, secondCreatePKBodyParams];
}

describe('PersonenkontexteUpdate', () => {
    let module: TestingModule;
    let personRepoMock: DeepMocked<PersonRepository>;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let dBiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let dBiamPersonenkontextRepoInternalMock: DeepMocked<DBiamPersonenkontextRepoInternal>;
    let dbiamPersonenkontextFactory: DbiamPersonenkontextFactory;
    let sut: PersonenkontexteUpdate;
    let personId: string;
    let lastModified: Date;
    let bodyParam1: DbiamPersonenkontextBodyParams;
    let bodyParam2: DbiamPersonenkontextBodyParams;
    let pk1: Personenkontext<true>;
    let pk2: Personenkontext<true>;
    let personPermissionsMock: PersonPermissionsMock;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                EmailPersistenceModule,
                EmailMicroserviceModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
            ],
            providers: [
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: DBiamPersonenkontextRepoInternal,
                    useValue: createMock(DBiamPersonenkontextRepoInternal),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
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
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock(EmailResolverService),
                },
                DbiamPersonenkontextFactory,
                PersonenkontextFactory,
            ],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(DBiamPersonenkontextRepoInternal)
            .useValue(createMock(DBiamPersonenkontextRepoInternal))
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .overrideProvider(OrganisationRepository)
            .useValue(createMock(OrganisationRepository))
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .overrideProvider(EmailRepo)
            .useValue(createMock(EmailRepo))
            .overrideProvider(EmailResolverService)
            .useValue(createMock(EmailResolverService))
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .compile();
        dBiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        dBiamPersonenkontextRepoInternalMock = module.get(DBiamPersonenkontextRepoInternal);
        personRepoMock = module.get(PersonRepository);
        organisationRepoMock = module.get(OrganisationRepository);
        dbiamPersonenkontextFactory = module.get(DbiamPersonenkontextFactory);
        personId = faker.string.uuid();
        lastModified = faker.date.recent();
        bodyParam1 = createMock<DbiamPersonenkontextBodyParams>(DbiamPersonenkontextBodyParams, {
            personId: personId,
            organisationId: faker.string.uuid(),
            rolleId: faker.string.uuid(),
            befristung: undefined,
        });
        bodyParam2 = createMock<DbiamPersonenkontextBodyParams>(DbiamPersonenkontextBodyParams, {
            personId: personId,
            organisationId: faker.string.uuid(),
            rolleId: faker.string.uuid(),
            befristung: faker.date.future(),
        });
        pk1 = vi.mockObject<Personenkontext<true>>(
            DoFactory.createPersonenkontext<true>(true, {
                updatedAt: lastModified,
                personId: bodyParam1.personId,
                organisationId: bodyParam1.organisationId,
                rolleId: bodyParam1.rolleId,
                befristung: bodyParam1.befristung,
            }),
        );
        pk2 = vi.mockObject<Personenkontext<true>>(
            DoFactory.createPersonenkontext<true>(true, {
                updatedAt: faker.date.past(),
                personId: bodyParam2.personId,
                organisationId: bodyParam2.organisationId,
                rolleId: bodyParam2.rolleId,
                befristung: bodyParam2.befristung,
            }),
        );
        personPermissionsMock = new PersonPermissionsMock();
        rolleRepoMock = module.get(RolleRepo);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(dbiamPersonenkontextFactory).toBeDefined();
    });

    describe('update', () => {
        describe.each([
            ...RollenmerkmalSystemrechtPaar.ALL.map((paar: RollenmerkmalSystemrechtPaar) => ({
                merkmale: [paar.merkmal],
                deniedSystemrecht: paar.systemrecht,
            })),
            {
                merkmale: [RollenMerkmal.MPT_ROLLE, RollenMerkmal.PILOT_1_ROLLE],
                deniedSystemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
            },
            {
                merkmale: [RollenMerkmal.MPT_ROLLE, RollenMerkmal.PILOT_1_ROLLE],
                deniedSystemrecht: RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN,
            },
        ])(
            'gated permissions for $merkmale',
            ({ merkmale, deniedSystemrecht }: { merkmale: RollenMerkmal[]; deniedSystemrecht: RollenSystemRecht }) => {
                let mptPK: Personenkontext<true>;
                let regularPK: Personenkontext<true>;
                let permissions: DeepMocked<PersonPermissions>;

                beforeEach(() => {
                    mptPK = DoFactory.createPersonenkontext(true, {
                        personId,
                        updatedAt: lastModified,
                        befristung: new Date('2099-07-31'),
                    });
                    regularPK = DoFactory.createPersonenkontext(true, {
                        personId,
                        updatedAt: lastModified,
                        befristung: undefined,
                    });
                    const mptRolle: Rolle<true> = DoFactory.createRolle(true, {
                        id: mptPK.rolleId,
                        rollenart: RollenArt.LEHR,
                        merkmale,
                    });
                    const regularRolle: Rolle<true> = DoFactory.createRolle(true, {
                        id: regularPK.rolleId,
                        rollenart: RollenArt.LEHR,
                        merkmale: [],
                    });
                    rolleRepoMock.findByIds.mockResolvedValue(
                        new Map([
                            [mptRolle.id, mptRolle],
                            [regularRolle.id, regularRolle],
                        ]),
                    );
                    organisationRepoMock.findByIds.mockResolvedValue(new Map());
                    personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true, { id: personId }));
                    permissions = createPersonPermissionsMock();
                    permissions.hasSystemrechtAtOrganisation.mockImplementation(
                        (organisationId: string, systemrecht: RollenSystemRecht): Promise<boolean> =>
                            Promise.resolve(
                                systemrecht !== deniedSystemrecht || organisationId === regularPK.organisationId,
                            ),
                    );
                });

                it.each(['add', 'remove', 'change Befristung'])(
                    'should reject an unauthorized gated %s before any writes',
                    async (operation: string) => {
                        const existing: Personenkontext<true>[] =
                            operation === 'add' ? [regularPK] : [regularPK, mptPK];
                        const sent: DbiamPersonenkontextBodyParams[] =
                            operation === 'remove'
                                ? [regularPK]
                                : [
                                      regularPK,
                                      {
                                          personId,
                                          organisationId: mptPK.organisationId,
                                          rolleId: mptPK.rolleId,
                                          befristung:
                                              operation === 'change Befristung'
                                                  ? new Date('2099-08-01')
                                                  : mptPK.befristung,
                                      },
                                  ];
                        dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue(existing);
                        dBiamPersonenkontextRepoMock.find.mockImplementation(
                            (_personId: string, organisationId: string, rolleId: string) =>
                                Promise.resolve(
                                    existing.find(
                                        (pk: Personenkontext<true>) =>
                                            pk.organisationId === organisationId && pk.rolleId === rolleId,
                                    ),
                                ),
                        );
                        const update: PersonenkontexteUpdate =
                            dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                                personId,
                                lastModified,
                                existing.length,
                                sent,
                                permissions,
                                '1234567',
                            );

                        const result: Personenkontext<true>[] | PersonenkontexteUpdateError = await update.update();

                        expect(result).toBeInstanceOf(MissingPermissionsError);
                        expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                            mptPK.organisationId,
                            deniedSystemrecht,
                        );
                        expect(dBiamPersonenkontextRepoInternalMock.save).not.toHaveBeenCalled();
                        expect(dBiamPersonenkontextRepoInternalMock.delete).not.toHaveBeenCalled();
                        expect(personRepoMock.updatePersonMetadata).not.toHaveBeenCalled();
                        expect(module.get(EventRoutingLegacyKafkaService).publish).not.toHaveBeenCalled();
                    },
                );

                it('should allow a regular addition while retaining an unchanged gated context', async () => {
                    const fetchedMptPK: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                        personId,
                        organisationId: mptPK.organisationId,
                        rolleId: mptPK.rolleId,
                        befristung: new Date(mptPK.befristung!),
                        updatedAt: lastModified,
                    });
                    dBiamPersonenkontextRepoMock.find
                        .mockResolvedValueOnce(fetchedMptPK)
                        .mockResolvedValueOnce(undefined);
                    dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([mptPK]);
                    dBiamPersonenkontextRepoInternalMock.save.mockResolvedValue(regularPK);
                    personRepoMock.findById.mockResolvedValueOnce(DoFactory.createPerson(true, { id: personId }));
                    personRepoMock.findById.mockResolvedValue(undefined);
                    const update: PersonenkontexteUpdate = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                        personId,
                        lastModified,
                        1,
                        [fetchedMptPK, regularPK],
                        permissions,
                    );

                    const result: Personenkontext<true>[] | PersonenkontexteUpdateError = await update.update();

                    expect(result).toBeInstanceOf(Array);
                    expect(permissions.hasSystemrechtAtOrganisation).not.toHaveBeenCalledWith(
                        mptPK.organisationId,
                        deniedSystemrecht,
                    );
                    expect(dBiamPersonenkontextRepoInternalMock.delete).not.toHaveBeenCalled();
                    expect(dBiamPersonenkontextRepoInternalMock.save).toHaveBeenCalledWith(
                        expect.objectContaining({ rolleId: regularPK.rolleId }),
                    );
                });

                it('should allow a gated addition when all corresponding systemrechte are held', async () => {
                    permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);
                    dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(regularPK).mockResolvedValueOnce(undefined);
                    dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([regularPK]);
                    dBiamPersonenkontextRepoInternalMock.save.mockResolvedValue(mptPK);
                    personRepoMock.findById.mockResolvedValueOnce(DoFactory.createPerson(true, { id: personId }));
                    personRepoMock.findById.mockResolvedValue(undefined);
                    const update: PersonenkontexteUpdate = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                        personId,
                        lastModified,
                        1,
                        [regularPK, mptPK],
                        permissions,
                    );

                    const result: Personenkontext<true>[] | PersonenkontexteUpdateError = await update.update();

                    expect(result).toBeInstanceOf(Array);
                    expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                        mptPK.organisationId,
                        deniedSystemrecht,
                    );
                    expect(dBiamPersonenkontextRepoInternalMock.save).toHaveBeenCalledWith(
                        expect.objectContaining({ rolleId: mptPK.rolleId }),
                    );
                });
            },
        );

        describe('when sent personenkontexte contain new personenkontext', () => {
            beforeAll(() => {
                const count: number = 1;

                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    count,
                    createPKBodyParams(personId),
                    personPermissionsMock,
                );
            });

            it('should return array of all persisted Personenkontext', async () => {
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(null);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(null); //mock pk2 is not found => therefore handled as new
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]); //mock pk1 is found as existing in DB

                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); // mock while checking the existing PKs
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock the return values in the end of update method
                const rolle: Rolle<true> = DoFactory.createRolle(true, {
                    rollenart: RollenArt.LEHR,
                    merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                    id: pk1.rolleId,
                    serviceProviderData: [DoFactory.createServiceProvider(true)],
                });

                const mapRollen: Map<string, Rolle<true>> = new Map<string, Rolle<true>>();
                mapRollen.set(pk1.rolleId, rolle);
                mapRollen.set(pk2.rolleId, DoFactory.createRolle(true, { id: pk2.rolleId, rollenart: RollenArt.LEHR }));
                const mapOrgas: Map<string, Organisation<true>> = new Map<string, Organisation<true>>();
                mapOrgas.set(pk1.organisationId, DoFactory.createOrganisation(true, { id: pk1.organisationId }));
                mapOrgas.set(pk2.organisationId, DoFactory.createOrganisation(true, { id: pk2.organisationId }));
                rolleRepoMock.findByIds.mockResolvedValue(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValue(mapOrgas);
                const person: Person<true> = DoFactory.createPerson(true, {
                    id: personId,
                    orgUnassignmentDate: faker.date.past(),
                });
                personRepoMock.findById.mockResolvedValue(person);
                dBiamPersonenkontextRepoInternalMock.save.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoInternalMock.save.mockResolvedValueOnce(pk2);

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(Array);
                expect(personRepoMock.save).toHaveBeenCalledWith(
                    expect.objectContaining({ id: personId, orgUnassignmentDate: undefined }),
                );
            });
        });

        describe('when personenkontext is deleted', () => {
            beforeAll(() => {
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    2,
                    [pk1],
                    personPermissionsMock,
                );
            });

            it('should delete the personenkontext', async () => {
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock pk1 and pk2 is found as existing in DB
                const newPerson: Person<true> = DoFactory.createPerson(true, { id: pk1.personId });
                personRepoMock.findById.mockResolvedValueOnce(newPerson);

                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); // mock while checking the existing PKs
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]); //mock the return values in the end of update method
                const rolle: Rolle<true> = DoFactory.createRolle(true, {
                    rollenart: RollenArt.LEHR,
                    merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                    id: pk1.rolleId,
                    serviceProviderData: [DoFactory.createServiceProvider(true)],
                });

                const mapRollen: Map<string, Rolle<true>> = new Map<string, Rolle<true>>();
                mapRollen.set(pk1.rolleId, rolle);
                mapRollen.set(pk2.rolleId, DoFactory.createRolle(true, { id: pk2.rolleId, rollenart: RollenArt.LEHR }));
                const mapOrgas: Map<string, Organisation<true>> = new Map<string, Organisation<true>>();
                mapOrgas.set(pk1.organisationId, DoFactory.createOrganisation(true, { id: pk1.organisationId }));
                mapOrgas.set(pk2.organisationId, DoFactory.createOrganisation(true, { id: pk2.organisationId }));
                rolleRepoMock.findByIds.mockResolvedValue(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValue(mapOrgas);
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true, { id: personId }));
                dBiamPersonenkontextRepoInternalMock.save.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoInternalMock.save.mockResolvedValueOnce(pk2);

                dBiamPersonenkontextRepoInternalMock.delete.mockResolvedValueOnce();

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(Array);
            });

            it('should log if delete from DB fails', async () => {
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock pk1 and pk2 is found as existing in DB
                const newPerson: Person<true> = DoFactory.createPerson(true, { id: pk1.personId });
                personRepoMock.findById.mockResolvedValueOnce(newPerson);

                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); // mock while checking the existing PKs
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]); //mock the return values in the end of update method

                const mapRollen: Map<string, Rolle<true>> = new Map<string, Rolle<true>>();
                mapRollen.set(
                    pk1.rolleId,
                    DoFactory.createRolle(true, { id: pk1.rolleId, rollenart: RollenArt.LEHR, merkmale: [] }),
                );
                mapRollen.set(
                    pk2.rolleId,
                    DoFactory.createRolle(true, { id: pk2.rolleId, rollenart: RollenArt.LEHR, merkmale: [] }),
                );
                const mapOrgas: Map<string, Organisation<true>> = new Map<string, Organisation<true>>();
                mapOrgas.set(pk1.organisationId, DoFactory.createOrganisation(true, { id: pk1.organisationId }));
                mapOrgas.set(pk2.organisationId, DoFactory.createOrganisation(true, { id: pk2.organisationId }));
                rolleRepoMock.findByIds.mockResolvedValue(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValue(mapOrgas);
                personRepoMock.findById.mockResolvedValue(DoFactory.createPerson(true, { id: personId }));
                dBiamPersonenkontextRepoInternalMock.save.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoInternalMock.save.mockResolvedValueOnce(pk2);

                dBiamPersonenkontextRepoInternalMock.delete.mockRejectedValueOnce(new Error('DB Error'));

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(Array);
                loggerMock.error.mock.calls.find((call: [message: string, trace?: unknown]) => {
                    return (
                        call[0].includes(`Personenkontext with ID ${pk2.id} could not be deleted!`) &&
                        (call[1] as Error).message === 'DB Error'
                    );
                });
            });
        });

        describe('when personenkontext could not be saved', () => {
            beforeAll(() => {
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    0,
                    [pk1],
                    personPermissionsMock,
                );
            });

            it('should log error', async () => {
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(null);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(null); //mock pk1 is not found => therefore handled as new
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([]); //person has no existing PKs
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([]); //CheckRollenartLernSpecification: person has no existing PKs
                rolleRepoMock.findByIds.mockResolvedValue(new Map());
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); // mock while checking the existing PKs
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]);
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map());

                const error: Error = new Error('DB Error');
                dBiamPersonenkontextRepoInternalMock.save.mockRejectedValueOnce(error);

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(Array);
                expect(loggerMock.error).toHaveBeenCalledWith(
                    expect.stringMatching(/Personenkontext with \(.*\) could not be added!/),
                    error,
                );
            });
        });

        describe('when sent personenkontexte contain personenkontext with mismatching personId', () => {
            beforeAll(() => {
                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    faker.string.uuid(),
                    lastModified,
                    count,
                    createPKBodyParams(personId),
                    personPermissionsMock,
                );
            });

            it('should return UpdatePersonIdMismatchError', async () => {
                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();
                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(
                    faker.string.uuid(),
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LEHR,
                        merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                    }),
                );
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                expect(updateError).toBeInstanceOf(UpdatePersonIdMismatchError);
            });
        });

        describe('when existing personenkontexte amount does NOT match count', () => {
            beforeAll(() => {
                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    count,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                );
            });

            it('should return UpdateCountError', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]); //mock: only one PK is found
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeInstanceOf(UpdateCountError);
            });
        });

        describe('when most recent updated PK time does not match lastModified time', () => {
            beforeAll(() => {
                const wrongLastModified: Date = faker.date.past({ refDate: lastModified });
                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    wrongLastModified,
                    count,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                );
            });

            it('should return UpdateOutdatedError', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock: both PKs are found
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValue(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeInstanceOf(UpdateOutdatedError);
            });
        });

        describe('when person is not found', () => {
            beforeAll(() => {
                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    count,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                );
            });

            it('should return UpdatePersonNotFound', async () => {
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock: only one PK is found
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                personRepoMock.findById.mockResolvedValue(undefined);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeInstanceOf(UpdatePersonNotFoundError);
            });
        });

        describe('when validate returns no errors', () => {
            beforeEach(() => {
                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    count,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                );
            });

            it('should return null asc order', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock: both PKs are found
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock: return the PKs found after update
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock for event

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                personRepoMock.findById.mockResolvedValue(undefined);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(Array);
                expect(dBiamPersonenkontextRepoInternalMock.delete).toHaveBeenCalledTimes(0);
            });

            // This test only test for right sorting by date of PKs, pk2 and pk1 are switched in retrieval order
            it('should return null', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk2, pk1]); //mock: both PKs are found
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock: return the PKs found after update
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                personRepoMock.findById.mockResolvedValue(undefined);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                expect(dBiamPersonenkontextRepoInternalMock.delete).toHaveBeenCalledTimes(0);
                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();
                expect(updateResult).toBeInstanceOf(Array);
            });
        });
        describe('when there are no existing PKs and lastModified is undefined', () => {
            beforeEach(() => {
                const count: number = 0;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    undefined,
                    count,
                    [],
                    personPermissionsMock,
                );
            });

            it('should return empty', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([]); // No existing PKs
                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                personRepoMock.findById.mockResolvedValue(undefined);

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();
                expect(updateResult).toEqual([]);
                expect(
                    personRepoMock.save.mock.calls[0] && personRepoMock.save.mock.calls[0][0].orgUnassignmentDate,
                ).toBeDefined();
            });
        });
        describe('when there are existing PKs but lastModified is undefined', () => {
            beforeEach(() => {
                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    undefined,
                    count,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                );
            });

            it('should return UpdateOutdatedError', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); // Existing PKs
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValue(mapRollen);
                personRepoMock.findById.mockResolvedValue(undefined);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(UpdateOutdatedError);
            });
        });

        describe('when permissions are insufficient', () => {
            it('should return MissingPermissionsError if the target person can not be modified', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk2, pk1]); //mock: both PKs are found
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]); //mock: return the PKs found after update

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                personRepoMock.findById.mockResolvedValue(undefined);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissions.canModifyPerson.mockResolvedValueOnce(false);
                const pkUpdate: PersonenkontexteUpdate = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    2,
                    [bodyParam1, bodyParam2],
                    permissions,
                );

                await expect(pkUpdate.update()).resolves.toBeInstanceOf(MissingPermissionsError);
            });

            it('should return MissingPermissionsError if the user can not modify persons at organisation', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                const pk1Changed: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    updatedAt: lastModified,
                    personId: pk1.personId,
                    organisationId: bodyParam1.organisationId,
                    rolleId: bodyParam1.rolleId,
                    befristung: new Date(),
                });
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk2, pk1Changed]); //mock: both PKs are found
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1Changed, pk2]); //mock: return the PKs found after update

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                personRepoMock.findById.mockResolvedValue(undefined);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissions.canModifyPerson.mockResolvedValueOnce(true);
                permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);
                const pkUpdate: PersonenkontexteUpdate = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    2,
                    [bodyParam1, bodyParam2],
                    permissions,
                );

                await expect(pkUpdate.update()).resolves.toBeInstanceOf(MissingPermissionsError);
            });
        });
        describe('when personalnummer is provided', () => {
            it('should update the personalnummer of the person', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);

                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValue(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse

                // Mock call before publishing the event
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]);

                // Mock call if the personalnummer exists
                personRepoMock.findById.mockResolvedValueOnce(newPerson);

                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1, pk2]);

                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    count,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                    '1234567',
                );
                await sut.update();

                expect(personRepoMock.updatePersonMetadata).toHaveBeenCalledTimes(1);
            });
        });
        describe('when existing personenkontexte have one personenkontext with rollenart LERN', () => {
            beforeAll(() => {
                const count: number = 2;
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    count,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                );
            });

            it('should return UpdateInvalidRollenartForLernError, if new personenkontext is not a Rolle with rollenart LERN', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeInstanceOf(UpdateInvalidRollenartForLernError);
            });
            it('should return UpdateInvalidRollenartForLernError if new personenkontext roles mix LERN with other types', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const mapRollenExisting: Map<string, Rolle<true>> = new Map();
                mapRollenExisting.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenExisting);

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeInstanceOf(UpdateInvalidRollenartForLernError);
            });
            it('Should not throw any Update invalid Rollenart error', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse

                const mapRollenExisting: Map<string, Rolle<true>> = new Map();
                mapRollenExisting.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));

                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenExisting);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeDefined();
            });
            it('should return PersonenkontextBefristungRequiredError if new personenkontext roles mix LERN with other types', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    2,
                    [{ ...bodyParam1, befristung: undefined }, bodyParam2],
                    personPermissionsMock,
                );
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // LernHatKlasse

                const mapRollenExisting: Map<string, Rolle<true>> = new Map();
                mapRollenExisting.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenExisting);

                const mapRollenBefristung: Map<string, Rolle<true>> = new Map();
                mapRollenBefristung.set(
                    pk1.rolleId,
                    DoFactory.createRolle(true, {
                        id: pk1.rolleId,
                        rollenart: RollenArt.LERN,
                        merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                    }),
                );
                mapRollenBefristung.set(
                    pk2.rolleId,
                    DoFactory.createRolle(true, {
                        id: pk2.rolleId,
                        rollenart: RollenArt.LERN,
                        merkmale: [RollenMerkmal.BEFRISTUNG_PFLICHT],
                    }),
                );

                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenBefristung);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenBefristung);

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeInstanceOf(PersonenkontextBefristungRequiredError);
            });
            it('should return DuplicatePersonalnummerError when saving person with personalnummer fails', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true, {
                    id: personId,
                    personalnummer: 'old-number',
                });

                // Setup sut with personalnummer
                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    2,
                    [bodyParam1, bodyParam2],
                    personPermissionsMock,
                    'new-personalnummer',
                );

                personRepoMock.findById.mockResolvedValue(newPerson);

                dBiamPersonenkontextRepoMock.find.mockResolvedValue(pk1);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([pk1, pk2]);

                rolleRepoMock.findByIds.mockImplementation(async (ids: string[]): Promise<Map<string, Rolle<true>>> => {
                    const map: Map<string, Rolle<true>> = new Map<string, Rolle<true>>();
                    for (const id of ids) {
                        if (id === pk1.rolleId || id === pk2.rolleId) {
                            map.set(
                                id,
                                DoFactory.createRolle(true, {
                                    id,
                                    rollenart: RollenArt.LEHR,
                                    merkmale: [],
                                }),
                            );
                        } else {
                            map.set(id, DoFactory.createRolle(true, { id, rollenart: RollenArt.LEHR }));
                        }
                    }
                    return Promise.resolve(map);
                });

                organisationRepoMock.findByIds.mockResolvedValue(new Map());

                const saveError: DuplicatePersonalnummerError = new DuplicatePersonalnummerError(
                    'PERSONALNUMMER_SAVE_ERROR',
                );
                personRepoMock.updatePersonMetadata.mockResolvedValue(saveError);

                const updateResult: Personenkontext<true>[] | DuplicatePersonalnummerError = await sut.update();

                expect(updateResult).toBeInstanceOf(DuplicatePersonalnummerError);
            });

            it('Should not throw any PersonenkontextBefristungRequiredError', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce([pk1]);
                organisationRepoMock.findByIds.mockResolvedValueOnce(new Map()); // LernHatKlasse

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const mapRollenExisting: Map<string, Rolle<true>> = new Map();
                mapRollenExisting.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));

                mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));

                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenExisting);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                vi.spyOn(CheckBefristungSpecification.prototype, 'checkBefristung').mockResolvedValue(true);

                const updateError: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateError).toBeDefined();
            });

            it('should return LernHatKeineKlasseError when user has pk at schule but not klasse', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                const administriertVonId: string = faker.string.uuid();
                const schuleId: string = faker.string.uuid();
                const rolleId: string = faker.string.uuid();

                // Create Personenkontext at schule but not klasse
                const bodyParam1: DbiamPersonenkontextBodyParams = {
                    personId: personId,
                    organisationId: schuleId,
                    rolleId: rolleId,
                };

                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    1,
                    [bodyParam1],
                    personPermissionsMock,
                );

                const pk1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    personId: personId,
                    organisationId: schuleId,
                    rolleId: rolleId,
                });

                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([]);

                // Mock CheckRollenartSpecification to return LERN rolle
                const mapRollenForRollenart: Map<string, Rolle<true>> = new Map();
                mapRollenForRollenart.set(
                    rolleId,
                    DoFactory.createRolle(true, {
                        id: rolleId,
                        rollenart: RollenArt.LERN,
                    }),
                );
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart); // For CheckRollenartSpecification (existing)
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart); // For CheckRollenartSpecification (sent)

                // Mock LernHatKlasse to return Klasse organisations
                const mapOrganisationen: Map<string, Organisation<true>> = new Map([
                    [
                        schuleId,
                        DoFactory.createOrganisation(true, {
                            id: schuleId,
                            typ: OrganisationsTyp.SCHULE,
                            administriertVon: administriertVonId,
                        }),
                    ],
                ]);

                organisationRepoMock.findByIds.mockResolvedValueOnce(mapOrganisationen); // For LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart); // For LernHatKlasse

                const mapRollenForBefristung: Map<string, Rolle<true>> = new Map();
                mapRollenForBefristung.set(
                    rolleId,
                    DoFactory.createRolle(true, {
                        id: rolleId,
                        rollenart: RollenArt.LERN,
                        merkmale: [],
                    }),
                );
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForBefristung);
                organisationRepoMock.findByIds.mockResolvedValueOnce(mapOrganisationen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart);

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(UpdateLernNotAtSchuleAndKlasseError);
            });

            it('should return DuplicateKlassenkontextError when user has duplicate Klassenkontext with same Rolle under same administering organisation', async () => {
                const newPerson: Person<true> = DoFactory.createPerson(true);
                const administriertVonId: string = faker.string.uuid();
                const rolleId: string = faker.string.uuid();
                const klasse1Id: string = faker.string.uuid();
                const klasse2Id: string = faker.string.uuid();
                const schuleId: string = faker.string.uuid();

                // Create two Personenkontexte with same rolle but different Klasse organisations under same administriertVon
                const bodyParam1: DbiamPersonenkontextBodyParams = {
                    personId: personId,
                    organisationId: klasse1Id,
                    rolleId: rolleId,
                };
                const bodyParam2: DbiamPersonenkontextBodyParams = {
                    personId: personId,
                    organisationId: klasse2Id,
                    rolleId: rolleId,
                };
                const bodyParam3: DbiamPersonenkontextBodyParams = {
                    personId: personId,
                    organisationId: schuleId,
                    rolleId: rolleId,
                };

                sut = dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
                    personId,
                    lastModified,
                    3,
                    [bodyParam1, bodyParam2, bodyParam3],
                    personPermissionsMock,
                );

                const pk1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    personId: personId,
                    organisationId: klasse1Id,
                    rolleId: rolleId,
                });
                const pk2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    personId: personId,
                    organisationId: klasse2Id,
                    rolleId: rolleId,
                });
                const pk3: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    personId: personId,
                    organisationId: schuleId,
                    rolleId: rolleId,
                });

                personRepoMock.findById.mockResolvedValueOnce(newPerson);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk1);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk2);
                dBiamPersonenkontextRepoMock.find.mockResolvedValueOnce(pk3);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([]);

                // Mock CheckRollenartSpecification to return LERN rolle
                const mapRollenForRollenart: Map<string, Rolle<true>> = new Map();
                mapRollenForRollenart.set(
                    rolleId,
                    DoFactory.createRolle(true, {
                        id: rolleId,
                        rollenart: RollenArt.LERN,
                    }),
                );
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart); // For CheckRollenartSpecification (existing)
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart); // For CheckRollenartSpecification (sent)

                // Mock LernHatKlasse to return Klasse organisations
                const mapOrganisationen: Map<string, Organisation<true>> = new Map();
                mapOrganisationen.set(
                    klasse1Id,
                    DoFactory.createOrganisation(true, {
                        id: klasse1Id,
                        typ: OrganisationsTyp.KLASSE,
                        administriertVon: schuleId,
                    }),
                );
                mapOrganisationen.set(
                    klasse2Id,
                    DoFactory.createOrganisation(true, {
                        id: klasse2Id,
                        typ: OrganisationsTyp.KLASSE,
                        administriertVon: schuleId,
                    }),
                );
                mapOrganisationen.set(
                    schuleId,
                    DoFactory.createOrganisation(true, {
                        id: schuleId,
                        typ: OrganisationsTyp.SCHULE,
                        administriertVon: administriertVonId,
                    }),
                );
                organisationRepoMock.findByIds.mockResolvedValueOnce(mapOrganisationen); // For LernHatKlasse
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart); // For LernHatKlasse

                const mapRollenForBefristung: Map<string, Rolle<true>> = new Map();
                mapRollenForBefristung.set(
                    rolleId,
                    DoFactory.createRolle(true, {
                        id: rolleId,
                        rollenart: RollenArt.LERN,
                        merkmale: [],
                    }),
                );
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForBefristung);
                organisationRepoMock.findByIds.mockResolvedValueOnce(mapOrganisationen);
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollenForRollenart);

                const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await sut.update();

                expect(updateResult).toBeInstanceOf(DuplicateKlassenkontextError);
            });
        });
    });
});
