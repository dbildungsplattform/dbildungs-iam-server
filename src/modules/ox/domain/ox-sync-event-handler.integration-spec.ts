import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import assert from 'node:assert';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { PersonIdentifier } from '../../../core/logging/person-identifier.js';
import { OxError } from '../../../shared/error/ox.error.js';
import { LdapSyncCompletedEvent } from '../../../shared/events/ldap/ldap-sync-completed.event.js';
import { OrganisationID, PersonID, PersonUsername, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { OXUserID } from '../../../shared/types/ox-ids.types.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EmailAddress, EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { OxAdapter } from '../adapter/domain/ox.adapter.js';
import { OxSendService } from '../adapter/technical/ox.send-service.js';
import { OxSyncEventHandler } from './ox-sync-event-handler.js';

describe('OxSyncEventHandler', () => {
    let app: INestApplication;
    let module: TestingModule;
    let orm: MikroORM;

    let sut: OxSyncEventHandler;
    let loggerMock: DeepMocked<ClassLogger>;

    let personRepositoryMock: DeepMocked<PersonRepository>;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let dBiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let oxServiceMock: DeepMocked<OxSendService>;
    let emailResolverServiceMock: DeepMocked<EmailResolverService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true })],
            providers: [
                OxSyncEventHandler,
                OxAdapter,
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
                {
                    provide: OxSendService,
                    useValue: createMock(OxSendService),
                },
                {
                    provide: EmailResolverService,
                    useValue: createMock<EmailResolverService>(EmailResolverService),
                },
            ],
        }).compile();

        sut = module.get(OxSyncEventHandler);
        loggerMock = module.get(ClassLogger);

        personRepositoryMock = module.get(PersonRepository);
        emailRepoMock = module.get(EmailRepo);

        organisationRepositoryMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
        dBiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        emailResolverServiceMock = module.get(EmailResolverService);

        emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValue(false);

        oxServiceMock = module.get(OxSendService);
        orm = module.get(MikroORM);
        await DatabaseTestModule.setupDatabase(orm);
        app = module.createNestApplication();
        await app.init();
    });

    function getEmailAddress(personsId: PersonID, address: string, status: EmailAddressStatus): EmailAddress<true> {
        return EmailAddress.construct(
            faker.string.uuid(),
            faker.date.past(),
            faker.date.recent(),
            personsId,
            address,
            status,
            undefined,
        );
    }

    function getOrga(
        kennung: string = faker.string.numeric({ length: 7 }),
        typ: OrganisationsTyp = OrganisationsTyp.SCHULE,
    ): Organisation<true> {
        return DoFactory.createOrganisation(true, { kennung: kennung, typ: typ });
    }

    function getRolle(rollenart: RollenArt = RollenArt.LEHR): Rolle<true> {
        return DoFactory.createRolle(true, { rollenart: rollenart });
    }

    function getOrgaMap(...orgas: Organisation<true>[]): Map<OrganisationID, Organisation<true>> {
        const map: Map<OrganisationID, Organisation<true>> = new Map<OrganisationID, Organisation<true>>();
        orgas.map((orga: Organisation<true>) => map.set(orga.id, orga));
        return map;
    }

    function getRolleMap(...rollen: Rolle<true>[]): Map<RolleID, Rolle<true>> {
        const map: Map<RolleID, Rolle<true>> = new Map<RolleID, Rolle<true>>();
        rollen.map((rolle: Rolle<true>) => map.set(rolle.id, rolle));
        return map;
    }

    /**
     * Creates three PKs for given person, two with rollenArt LEHR and one with rollenArt LERN, every PK targets another fresh created organisation.
     * The returned result is 1. list of the PKs followed by orgaMap and then rolleMap.
     * All three different result values are used as result in mocked method calls (DbiamPersonenkontextRepo, OrganisationRepository and RolleRepo).
     * @param pkPerson
     */
    function getPkArrayOrgaMapAndRolleMap(
        pkPerson: Person<true>,
    ): [Personenkontext<true>[], Map<OrganisationID, Organisation<true>>, Map<RolleID, Rolle<true>>] {
        const lehrRolle1: Rolle<true> = getRolle();
        const lehrOrga1: Organisation<true> = getOrga();
        const lehrPk1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
            organisationId: lehrOrga1.id,
            rolleId: lehrRolle1.id,
            personId: pkPerson.id,
        });
        const lehrRolle2: Rolle<true> = getRolle();
        const lehrOrga2: Organisation<true> = getOrga();
        const lehrPk2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
            organisationId: lehrOrga2.id,
            rolleId: lehrRolle2.id,
            personId: pkPerson.id,
        });

        // used to cover filtering on RollenArt LEHR
        const lernRolle1: Rolle<true> = getRolle(RollenArt.LERN);
        const lernOrga1: Organisation<true> = getOrga();
        const lernPk1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
            organisationId: lernOrga1.id,
            rolleId: lernRolle1.id,
            personId: pkPerson.id,
        });

        // used to cover filtering on OrganisationsTyp SCHULE
        const lehrRolleForPKOnKlasse: Rolle<true> = getRolle();
        const lehrOrgaForPkOnKlasse: Organisation<true> = getOrga(
            faker.string.numeric({ length: 7 }),
            OrganisationsTyp.KLASSE,
        );
        const lehrPKOnKlasse: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
            organisationId: lehrOrgaForPkOnKlasse.id,
            rolleId: lehrRolleForPKOnKlasse.id,
            personId: pkPerson.id,
        });

        const pk: Personenkontext<true>[] = [lehrPk1, lehrPk2, lernPk1, lehrPKOnKlasse];
        const orgaMap: Map<OrganisationID, Organisation<true>> = getOrgaMap(
            lehrOrga1,
            lehrOrga2,
            lernOrga1,
            lehrOrgaForPkOnKlasse,
        );
        const rolleMap: Map<RolleID, Rolle<true>> = getRolleMap(
            lehrRolle1,
            lehrRolle2,
            lernRolle1,
            lehrRolleForPKOnKlasse,
        );

        return [pk, orgaMap, rolleMap];
    }

    function mockPersonenKontextRelatedRepositoryCalls(
        kontexte: Personenkontext<true>[],
        orgaMap: Map<OrganisationID, Organisation<true>>,
        rolleMap: Map<RolleID, Rolle<true>>,
    ): void {
        dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValueOnce(kontexte);
        organisationRepositoryMock.findByIds.mockResolvedValueOnce(orgaMap);
        rolleRepoMock.findByIds.mockResolvedValueOnce(rolleMap);
    }

    function mockOxServiceSendTimes(results: unknown[], times: number = 1): void {
        for (let i: number = 0; i < times; i++) {
            for (const res of results) {
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: res,
                });
            }
        }
    }

    function mockGetGroupRemoveMemberFromGroup(oxUserId: OXUserID, times: number = 1): void {
        //mock OxGetGroup-request and OxRemoveMember-request 3 times (3 organisations are found)
        mockOxServiceSendTimes(
            [
                {
                    groups: [
                        {
                            displayname: 'displayName',
                            id: 'oxGroupId',
                            name: 'oxGroupName',
                            memberIds: [oxUserId],
                        },
                    ],
                },
                {
                    status: {
                        code: 'success',
                    },
                    data: undefined,
                },
            ],
            times,
        );
    }

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        sut.ENABLED = true;
        vi.resetAllMocks();
    });

    describe('changeOxUser', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let oxUserId: OXUserID;
        let personIdentifier: PersonIdentifier;
        let event: LdapSyncCompletedEvent;
        let person: Person<true>;
        let address: string;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            oxUserId = faker.string.numeric({ length: 5 });
            personIdentifier = {
                personId: personId,
                username: username,
            };
            event = new LdapSyncCompletedEvent(personId, username);
            person = DoFactory.createPerson(true, {
                email: faker.internet.email(),
                username: faker.internet.username(),
                oxUserId: oxUserId,
            });
            address = faker.internet.email();

            // create PKs, orgaMap and rolleMap
            const [kontexte, orgaMap, rolleMap]: [
                Personenkontext<true>[],
                Map<OrganisationID, Organisation<true>>,
                Map<RolleID, Rolle<true>>,
            ] = getPkArrayOrgaMapAndRolleMap(person);
            mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);
        });

        describe('when email microservice is enabled', () => {
            it('should log info and stop execution', async () => {
                emailResolverServiceMock.shouldUseEmailMicroservice.mockReturnValueOnce(true);

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Ignoring Event for personId:${event.personId} because email microservice is enabled`,
                );
            });
        });

        describe('when person CANNOT be found', () => {
            it('should log error and return without proceeding', async () => {
                //mock person CANNOT be found in changeUser
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);
                //mock person CANNOT be found in changeUserGroups
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(`Person not found`, personIdentifier);
            });
        });

        describe('when persons username is NOT defined', () => {
            it('should log error and return without proceeding', async () => {
                person = DoFactory.createPerson(false, {
                    id: faker.string.uuid(),
                    username: undefined,
                }) as unknown as Person<true>; //necessary because persisted persons have a username
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    `Person has no username: Cannot Change Email-Address In OX`,
                    personIdentifier,
                );
            });
        });

        describe('when person does NOT have an oxUserId', () => {
            it('should log error and return without proceeding', async () => {
                person = DoFactory.createPerson(true, { oxUserId: undefined });
                personRepositoryMock.findById.mockResolvedValueOnce(person);

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(`Person has no OxUserId`, personIdentifier);
            });
        });

        describe('when ENABLED EA is NOT found, but REQUESTED EA is found', () => {
            it('should log warning', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                const ea: EmailAddress<true> = getEmailAddress(personId, address, EmailAddressStatus.REQUESTED);
                //mock search for ENABLED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);
                //mock search for REQUESTED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([ea]);
                //mock search for DISABLED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);

                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `No ENABLED email-address found for personId:${personId}`,
                );
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found mostRecentRequested Email-Address:${JSON.stringify(ea.address)} for personId:${personId}`,
                );
            });
        });

        describe('when neither ENABLED EA nor REQUESTED EA is found', () => {
            it('should log error and return without proceeding', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                //mock search for ENABLED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);
                //mock search for REQUESTED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Neither REQUESTED nor ENABLED email-address found for personId:${personId}`,
                );
            });
        });

        describe('when DISABLED EmailAddresses are found', () => {
            it('should add them to aliases', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                const ea: EmailAddress<true> = getEmailAddress(personId, address, EmailAddressStatus.ENABLED);
                //mock search for ENABLED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([ea]);
                //mock search for disabled EAs
                const disabledEmailAddressString1: string = faker.internet.email();
                const disabledEmailAddressString2: string = faker.internet.email();
                const disabledEmailAddress1: EmailAddress<true> = getEmailAddress(
                    personId,
                    disabledEmailAddressString1,
                    EmailAddressStatus.DISABLED,
                );
                const disabledEmailAddress2: EmailAddress<true> = getEmailAddress(
                    personId,
                    disabledEmailAddressString2,
                    EmailAddressStatus.DISABLED,
                );
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([
                    disabledEmailAddress1,
                    disabledEmailAddress2,
                ]);

                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });

                await sut.ldapSyncCompletedEventHandler(event);

                const aliases: string[] = [disabledEmailAddressString1, disabledEmailAddressString2, address];
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found mostRecentEnabled Email-Address:${JSON.stringify(ea.address)} for personId:${personId}`,
                );
                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Current aliases to be written:${JSON.stringify(aliases)}, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
                );
            });
        });

        describe('when OxChangeUser-request fails', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                const ea: EmailAddress<true> = getEmailAddress(personId, address, EmailAddressStatus.ENABLED);
                //mock search for ENABLED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([ea]);
                //mock search for disabled EAs (no EAs with DISABLED status found)
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);
                const oxError: OxError = new OxError('message');
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: oxError,
                });

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found mostRecentEnabled Email-Address:${JSON.stringify(ea.address)} for personId:${personId}`,
                );
                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    `Could not rewrite OxUser for oxUserId:${person.oxUserId}, error:${oxError.message}`,
                    personIdentifier,
                );
            });
        });

        describe('when OxChangeUser-request succeeds, but getting group fails', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                const ea: EmailAddress<true> = getEmailAddress(personId, address, EmailAddressStatus.ENABLED);
                //mock search for ENABLED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([ea]);
                //mock search for disabled EAs (no EAs with DISABLED status found)
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);
                const oxError: OxError = new OxError('message');
                //mock OxChangeUser-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                //mock OxGetGroup-request and OxRemoveMember-request 1 time (3 organisations found, but only one school)
                mockGetGroupRemoveMemberFromGroup(oxUserId, 1);

                //mock GetOxGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: oxError,
                });

                //create PKs, orgaMap and rolleMap
                const [kontexte, orgaMap, rolleMap]: [
                    Personenkontext<true>[],
                    Map<OrganisationID, Organisation<true>>,
                    Map<RolleID, Rolle<true>>,
                ] = getPkArrayOrgaMapAndRolleMap(person);
                mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found mostRecentEnabled Email-Address:${JSON.stringify(ea.address)} for personId:${personId}`,
                );
                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    expect.stringContaining(`Could not get OxGroup for schulenDstNr:`),
                    personIdentifier,
                );
            });
        });

        describe('when OxChangeUser-request succeeds, but adding member to group fails', () => {
            it('should log error', async () => {
                personRepositoryMock.findById.mockResolvedValue(person);
                const ea: EmailAddress<true> = getEmailAddress(personId, address, EmailAddressStatus.ENABLED);
                //mock search for ENABLED EAs
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([ea]);
                //mock search for disabled EAs (no EAs with DISABLED status found)
                emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);
                const oxError: OxError = new OxError('message');
                //mock OxChangeUser-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                //mock OxGetGroup-request and OxRemoveMember-request 1 time (3 organisations found, but only one school)
                mockGetGroupRemoveMemberFromGroup(oxUserId, 1);

                //mock OxGetGroup-requests when fetching for adding member to group
                mockOxServiceSendTimes(
                    [
                        {
                            groups: [
                                {
                                    displayname: 'displayName',
                                    id: 'oxGroupId',
                                    name: 'oxGroupName',
                                    memberIds: [oxUserId],
                                },
                            ],
                        },
                    ],
                    3,
                );

                //mock OxAddMemberToGroup-request
                oxServiceMock.send.mockResolvedValueOnce({
                    ok: false,
                    error: oxError,
                });

                //create PKs, orgaMap and rolleMap
                const [kontexte, orgaMap, rolleMap]: [
                    Personenkontext<true>[],
                    Map<OrganisationID, Organisation<true>>,
                    Map<RolleID, Rolle<true>>,
                ] = getPkArrayOrgaMapAndRolleMap(person);
                mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);

                await sut.ldapSyncCompletedEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Found mostRecentEnabled Email-Address:${JSON.stringify(ea.address)} for personId:${personId}`,
                );
                expect(loggerMock.errorPersonalized).toHaveBeenCalledWith(
                    expect.stringContaining(`Could not add oxUser to oxGroup, schulenDstNr:`),
                    personIdentifier,
                );
            });
        });
    });

    describe('getOrganisationKennungen', () => {
        let personId: PersonID;
        let username: PersonUsername;
        let oxUserId: OXUserID;
        let event: LdapSyncCompletedEvent;
        let person: Person<true>;
        let address: string;

        beforeEach(() => {
            vi.resetAllMocks();
            personId = faker.string.uuid();
            username = faker.internet.username();
            oxUserId = faker.string.numeric({ length: 5 });
            event = new LdapSyncCompletedEvent(personId, username);
            person = DoFactory.createPerson(true, {
                email: faker.internet.email(),
                username: faker.internet.username(),
                oxUserId: oxUserId,
            });
            address = faker.internet.email();
        });

        it('should log error, when an organisation in orgaMap CANNOT be found', async () => {
            personRepositoryMock.findById.mockResolvedValue(person);
            const ea: EmailAddress<true> = getEmailAddress(personId, address, EmailAddressStatus.ENABLED);
            //mock search for ENABLED EAs
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([ea]);
            //mock search for disabled EAs (no EAs with DISABLED status found)
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);

            //mock OxChangeUser-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            //mock OxGetGroup-request and OxRemoveMember-request 1 time (3 organisations found, but only one school)
            mockGetGroupRemoveMemberFromGroup(oxUserId, 1);

            // create PKs, orgaMap and rolleMap
            const [kontexte, orgaMap, rolleMap]: [
                Personenkontext<true>[],
                Map<OrganisationID, Organisation<true>>,
                Map<RolleID, Rolle<true>>,
            ] = getPkArrayOrgaMapAndRolleMap(person);
            // hence kontexte are filtered by organisations.has, removing one organisation from map here, would not create a coverage case
            // therefore a mocked map is used
            const mockedMap: DeepMocked<Map<OrganisationID, Organisation<true>>> = createMock(
                Map<OrganisationID, Organisation<true>>,
                {
                    entries: vi.fn(),
                    has: vi.fn(),
                    get: vi.fn(),
                    delete: vi.fn(),
                    set: vi.fn(),
                    clear: vi.fn(),
                },
            );
            mockedMap.entries.mockImplementationOnce(() => {
                return orgaMap.entries();
            });
            mockedMap.has.mockImplementationOnce((id: string) => {
                return orgaMap.has(id);
            });
            mockedMap.get.mockImplementationOnce(() => {
                return undefined;
            });
            mockPersonenKontextRelatedRepositoryCalls(kontexte, mockedMap, rolleMap);

            await sut.ldapSyncCompletedEventHandler(event);
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Could not find organisation, orgaId:`),
            );
        });

        it('should log error, when for at least one organisation in orgaMap kennung is NOT defined', async () => {
            personRepositoryMock.findById.mockResolvedValue(person);
            const ea: EmailAddress<true> = getEmailAddress(personId, address, EmailAddressStatus.ENABLED);
            //mock search for ENABLED EAs
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([ea]);
            //mock search for disabled EAs (no EAs with DISABLED status found)
            emailRepoMock.findByPersonSortedByUpdatedAtDesc.mockResolvedValueOnce([]);
            //mock OxChangeUser-request
            oxServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: undefined,
            });

            //mock OxGetGroup-request and OxRemoveMember-request 3 times (3 organisations are found)
            mockGetGroupRemoveMemberFromGroup(oxUserId, 3);

            // create PKs, orgaMap and rolleMap
            const [kontexte, orgaMap, rolleMap]: [
                Personenkontext<true>[],
                Map<OrganisationID, Organisation<true>>,
                Map<RolleID, Rolle<true>>,
            ] = getPkArrayOrgaMapAndRolleMap(person);
            // set kennung for an organisation undefined to force 'Required kennung is missing on organisation'
            assert(kontexte[0]);
            const orgaWithoutKennung: Organisation<true> | undefined = orgaMap.get(kontexte[0].organisationId);
            if (!orgaWithoutKennung) {
                throw Error();
            }
            orgaWithoutKennung.kennung = undefined;
            mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);

            await sut.ldapSyncCompletedEventHandler(event);
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Required kennung is missing on organisation, orgaId:`),
            );
        });
    });
});
