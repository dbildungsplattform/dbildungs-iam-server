import { MikroORM } from '@mikro-orm/core';
import { type INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { DatabaseTestModule, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS, DoFactory } from '../../../../test/utils/index.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';

import { faker } from '@faker-js/faker';
import assert from 'node:assert';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { OrganisationsTyp } from '../../../modules/organisation/domain/organisation.enums.js';
import { type Organisation } from '../../../modules/organisation/domain/organisation.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { type Person } from '../../../modules/person/domain/person.js';
import { PersonRepository } from '../../../modules/person/persistence/person.repository.js';
import { type Personenkontext } from '../../../modules/personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../modules/rolle/domain/rolle.enums.js';
import { type Rolle } from '../../../modules/rolle/domain/rolle.js';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { ServiceProviderSystem } from '../../../modules/service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../../modules/service-provider/domain/service-provider.js';
import { KafkaLdapSyncCompletedEvent } from '../../../shared/events/ldap/kafka-ldap-sync-completed.event.js';
import { LdapSyncCompletedEvent } from '../../../shared/events/ldap/ldap-sync-completed.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { PersonLdapSyncEvent } from '../../../shared/events/person-ldap-sync.event.js';
import {
    type OrganisationID,
    type PersonID,
    type PersonUsername,
    type RolleID,
} from '../../../shared/types/aggregate-ids.types.js';
import { EventRoutingLegacyKafkaService } from '../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { LdapFetchAttributeError } from '../adapter/domain/error/ldap-fetch-attribute.error.js';
import { LdapSearchError } from '../adapter/domain/error/ldap-search.error.js';
import { LdapAdapter, type LdapPersonAttributes } from '../adapter/domain/ldap.adapter.js';
import { LdapEntityType } from '../adapter/domain/ldap.types.js';
import { LdapModule } from '../ldap.module.js';
import { LdapSyncEventHandler } from './ldap-sync-event-handler.js';

describe('LdapSyncEventHandler', () => {
    const oeffentlicheSchulenDomain: string = 'schule-sh.de';

    let app: INestApplication;
    let orm: MikroORM;

    let sut: LdapSyncEventHandler;
    let ldapClientAdapterMock: DeepMocked<LdapAdapter>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let dBiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;
    let loggerMock: DeepMocked<ClassLogger>;

    let personId: PersonID;
    let username: PersonUsername;
    let event: PersonExternalSystemsSyncEvent;
    let vorname: string;
    let familienname: string;
    let person: Person<true>;
    let personAttributes: LdapPersonAttributes;
    let givenName: string;
    let surName: string;
    let cn: string;
    let mailPrimaryAddress: string;
    let mailAlternativeAddress: string;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LdapModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
            ],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(LdapAdapter)
            .useValue(createMock(LdapAdapter))
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(OrganisationRepository)
            .useValue(createMock(OrganisationRepository))
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .overrideProvider(ClassLogger)
            .useValue(createMock<ClassLogger>(ClassLogger))
            .compile();

        orm = module.get(MikroORM);

        loggerMock = module.get(ClassLogger);

        sut = module.get(LdapSyncEventHandler);
        ldapClientAdapterMock = module.get(LdapAdapter);
        personRepositoryMock = module.get(PersonRepository);
        dBiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        rolleRepoMock = module.get(RolleRepo);
        organisationRepositoryMock = module.get(OrganisationRepository);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
        loggerMock = module.get(ClassLogger);

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));
        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    function getOrga(
        kennung: string = faker.string.numeric({ length: 7 }),
        typ: OrganisationsTyp = OrganisationsTyp.SCHULE,
    ): Organisation<true> {
        return DoFactory.createOrganisation<true>(true, { kennung: kennung, typ: typ });
    }

    function getRolle(rollenart: RollenArt = RollenArt.LEHR): Rolle<true> {
        const serviceProviderData: ServiceProvider<true>[] =
            rollenart === RollenArt.LEHR
                ? [DoFactory.createServiceProvider<true>(true, { externalSystem: ServiceProviderSystem.UEM })]
                : [];
        return DoFactory.createRolle<true>(true, { rollenart: rollenart, serviceProviderData: serviceProviderData });
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
        const lehrPk1: Personenkontext<true> = DoFactory.createPersonenkontext<true>(true, {
            id: faker.string.uuid(),
            organisationId: lehrOrga1.id,
            rolleId: lehrRolle1.id,
            personId: pkPerson.id,
        });
        const lehrRolle2: Rolle<true> = getRolle();
        const lehrOrga2: Organisation<true> = getOrga();
        const lehrPk2: Personenkontext<true> = DoFactory.createPersonenkontext<true>(true, {
            id: faker.string.uuid(),
            organisationId: lehrOrga2.id,
            rolleId: lehrRolle2.id,
            personId: pkPerson.id,
        });

        // used to cover filtering on RollenArt LEHR
        const lernRolle1: Rolle<true> = getRolle(RollenArt.LERN);
        const lernOrga1: Organisation<true> = getOrga();
        const lernPk1: Personenkontext<true> = DoFactory.createPersonenkontext<true>(true, {
            id: faker.string.uuid(),
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
        const lehrPKOnKlasse: Personenkontext<true> = DoFactory.createPersonenkontext<true>(true, {
            id: faker.string.uuid(),
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

    function mockPersonFoundEnabledAddressFoundDisabledAddressNotFound(): void {
        personRepositoryMock.findById.mockResolvedValueOnce(person);
    }

    function mockPersonAttributesFoundGroupsNotFound(): void {
        ldapClientAdapterMock.getPersonAttributes.mockResolvedValueOnce({
            ok: true,
            value: personAttributes,
        });
        ldapClientAdapterMock.getGroupsForPerson.mockResolvedValueOnce({
            ok: true,
            value: [],
        });
    }

    function createDataFetchedByRepositoriesAndLDAP(): void {
        personId = faker.string.uuid();
        username = faker.internet.username();
        event = new PersonExternalSystemsSyncEvent(personId);
        vorname = faker.person.firstName();
        familienname = faker.person.lastName();
        person = DoFactory.createPerson<true>(true, {
            id: personId,
            username: username,
            vorname: vorname,
            familienname: familienname,
        });
        givenName = faker.person.firstName();
        surName = faker.person.lastName();
        cn = faker.internet.username();
        mailPrimaryAddress = faker.internet.email();
        mailAlternativeAddress = faker.internet.email();
        personAttributes = {
            entryUUID: undefined, // entryUUID is only set in LdapClientService when an empty PersonEntry had to be created
            dn: 'dn',
            givenName: givenName,
            surName: surName,
            cn: cn,
            mailPrimaryAddress: mailPrimaryAddress,
            mailAlternativeAddress: mailAlternativeAddress,
        };
    }

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        vi.resetAllMocks();
        await DatabaseTestModule.clearDatabase(orm);
    });

    //* This test case is just for coverage, all real test cases for syncing are handled in test for 'personExternalSystemSyncEventHandler */
    describe('triggerLdapSync', () => {
        beforeEach(() => {
            personId = faker.string.uuid();
            person = DoFactory.createPerson<true>(true);
        });

        describe('when person CANNOT be found by events personID', () => {
            it('should log error and return without proceeding', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                await sut.triggerLdapSync(personId);

                expect(loggerMock.error).toHaveBeenCalledWith(`Person with personId:${personId} could not be found!`);
            });
        });
    });

    //* This test case is just for coverage, all real test cases for syncing are handled in test for 'personExternalSystemSyncEventHandler */
    describe('personLdapSyncEventHandler', () => {
        beforeEach(() => {
            personId = faker.string.uuid();
            event = new PersonLdapSyncEvent(personId);
            person = DoFactory.createPerson<true>(true);
        });

        describe('when person CANNOT be found by events personID', () => {
            it('should log error and return without proceeding', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                await sut.personLdapSyncEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `[EventID: ${event.eventID}] Received PersonLdapSyncEvent, personId:${event.personId}`,
                );
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Person with personId:${event.personId} could not be found!`,
                );
            });
        });
    });

    describe('personExternalSystemSyncEventHandler', () => {
        beforeEach(() => {
            personId = faker.string.uuid();
            username = faker.internet.username();
            event = new PersonExternalSystemsSyncEvent(personId);
            person = DoFactory.createPerson<true>(true, { username: username });
        });

        describe('when person CANNOT be found by events personID', () => {
            it('should log error and return without proceeding', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(undefined);

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Person with personId:${event.personId} could not be found!`,
                );
            });
        });

        describe('when person has NO username', () => {
            it('should log error and return without proceeding', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(
                    DoFactory.createPerson<true>(true, { username: undefined }),
                );

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Person with personId:${event.personId} has no username!`,
                );
            });
        });

        describe('when no DISABLED email-addresses can be found for person', () => {
            it('should log info and proceed', async () => {
                personRepositoryMock.findById.mockResolvedValueOnce(person);
                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValue('example.org');

                // create PKs, orgaMap and rolleMap
                const [kontexte, orgaMap, rolleMap]: [
                    Personenkontext<true>[],
                    Map<OrganisationID, Organisation<true>>,
                    Map<RolleID, Rolle<true>>,
                ] = getPkArrayOrgaMapAndRolleMap(person);
                mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);

                ldapClientAdapterMock.getPersonAttributes.mockResolvedValueOnce({
                    ok: true,
                    value: {
                        entryUUID: faker.string.uuid(),
                        dn: 'dn',
                    },
                });

                ldapClientAdapterMock.getGroupsForPerson.mockResolvedValueOnce({
                    ok: true,
                    value: [],
                });

                await sut.personExternalSystemSyncEventHandler(event);

                expect(eventServiceMock.publish).toBeCalledWith(
                    expect.objectContaining({ personId, username }),
                    expect.objectContaining({ personId, username }),
                );
            });
        });

        describe('when fetching person-attributes in LDAP fails', () => {
            it('should log error and return', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();

                // create PKs, orgaMap and rolleMap
                const [kontexte, orgaMap, rolleMap]: [
                    Personenkontext<true>[],
                    Map<OrganisationID, Organisation<true>>,
                    Map<RolleID, Rolle<true>>,
                ] = getPkArrayOrgaMapAndRolleMap(person);
                mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);

                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(
                    oeffentlicheSchulenDomain,
                );

                const error: LdapFetchAttributeError = new LdapFetchAttributeError(personId, username, 'attribute');
                ldapClientAdapterMock.getPersonAttributes.mockResolvedValueOnce({
                    ok: false,
                    error: error,
                });

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Error while fetching attributes for personId:${personId} in LDAP, msg:${error.message}`,
                );
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
            });
        });

        describe('when fetching groups in LDAP for person fails', () => {
            it('should log error and return', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();

                // create PKs, orgaMap and rolleMap
                const [kontexte, orgaMap, rolleMap]: [
                    Personenkontext<true>[],
                    Map<OrganisationID, Organisation<true>>,
                    Map<RolleID, Rolle<true>>,
                ] = getPkArrayOrgaMapAndRolleMap(person);
                mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);

                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(
                    oeffentlicheSchulenDomain,
                );
                personAttributes = {
                    entryUUID: undefined, // entryUUID is only set in LdapClientService when an empty PersonEntry had to be created
                    dn: 'dn',
                };
                ldapClientAdapterMock.getPersonAttributes.mockResolvedValueOnce({
                    ok: true,
                    value: personAttributes,
                });

                ldapClientAdapterMock.getGroupsForPerson.mockResolvedValueOnce({
                    ok: false,
                    error: new LdapSearchError(LdapEntityType.LEHRER),
                });

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    expect.stringContaining('Error while fetching groups for personId'),
                );
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
            });
        });

        describe('when at least one organisation CANNOT be found in orgaMap', () => {
            it('should log error and return', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();

                // create PKs, orgaMap and rolleMap
                const [kontexte, orgaMap, rolleMap]: [
                    Personenkontext<true>[],
                    Map<OrganisationID, Organisation<true>>,
                    Map<RolleID, Rolle<true>>,
                ] = getPkArrayOrgaMapAndRolleMap(person);
                // hence kontexte are filtered by organisations.has, removing one organisation from map here, would not create a coverage case
                // therefore a second map is used
                const mockedMap: Map<OrganisationID, Organisation<true>> = {
                    entries: vi.fn().mockReturnValue(orgaMap.entries()),
                    has: vi.fn().mockRejectedValue(true),
                    get: vi.fn().mockReturnValue(undefined),
                    delete: vi.fn(),
                } as unknown as Map<OrganisationID, Organisation<true>>;

                mockPersonenKontextRelatedRepositoryCalls(kontexte, mockedMap, rolleMap);
                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(
                    oeffentlicheSchulenDomain,
                );

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(`Could not find organisation`));
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
            });
        });

        describe('when at least one organisation does NOT have a kennung', () => {
            it('should log error and return', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();

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
                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(
                    oeffentlicheSchulenDomain,
                );

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    expect.stringContaining(`Required kennung is missing on organisation`),
                );
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
            });
        });

        describe('when organisationIds CANNOT be found, no PKs exist', () => {
            it('should log error and return without syncing', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();
                mockPersonenKontextRelatedRepositoryCalls(
                    [],
                    new Map<OrganisationID, Organisation<true>>(),
                    new Map<RolleID, Rolle<true>>(),
                );

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could NOT fetch domain from organisations, no organisations found for person, ABORTING SYNC, personId:${personId}`,
                );
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
            });
        });

        describe('when emailDomain CANNOT be found in organisation tree recursively', () => {
            it('should log error and return without syncing', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();

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
                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(undefined);

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    expect.stringContaining(
                        `Could NOT fetch domain from organisations, LDAP-root CANNOT be chosen, ABORTING SYNC, personId:${personId}`,
                    ),
                );
                expect(loggerMock.info).not.toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
            });
        });
    });

    //* syncDataToLdap is tested via calling personExternalSystemSyncEventHandler */
    describe('syncDataToLdap', () => {
        beforeEach(() => {
            createDataFetchedByRepositoriesAndLDAP();
        });

        it('should synchronize person attributes and group memberships and publish completion', async () => {
            const rolle: Rolle<true> = getRolle();
            const schoolKennung: string = '1234567';
            const orphanKennung: string = '7654321';
            const organisation: Organisation<true> = getOrga(schoolKennung);
            const kontext: Personenkontext<true> = DoFactory.createPersonenkontext<true>(true, {
                personId: personId,
                organisationId: organisation.id,
                rolleId: rolle.id,
            });
            personRepositoryMock.findById.mockResolvedValueOnce(person);
            mockPersonenKontextRelatedRepositoryCalls([kontext], getOrgaMap(organisation), getRolleMap(rolle));
            organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(oeffentlicheSchulenDomain);
            ldapClientAdapterMock.getPersonAttributes.mockResolvedValueOnce({ ok: true, value: personAttributes });
            ldapClientAdapterMock.getGroupsForPerson.mockResolvedValueOnce({
                ok: true,
                value: [`cn=lehrer-${orphanKennung},cn=groups,ou=${orphanKennung},dc=schule-sh,dc=de`],
            });

            await sut.personExternalSystemSyncEventHandler(event);

            expect(ldapClientAdapterMock.modifyPersonAttributes).toHaveBeenCalledExactlyOnceWith(
                username,
                person.vorname,
                person.familienname,
                username,
            );
            expect(ldapClientAdapterMock.addPersonToGroup).toHaveBeenCalledExactlyOnceWith(
                username,
                schoolKennung,
                personAttributes.dn,
            );
            expect(ldapClientAdapterMock.removePersonFromGroup).toHaveBeenCalledExactlyOnceWith(
                username,
                orphanKennung,
                personAttributes.dn,
            );
            expect(eventServiceMock.publish).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ constructor: LdapSyncCompletedEvent, personId, username }),
                expect.objectContaining({ constructor: KafkaLdapSyncCompletedEvent, personId, username }),
            );
        });

        describe('when vorname and givenName, familienname and surName, username and cn DO NOT match', () => {
            it('should log info', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();

                // create PKs, orgaMap and rolleMap
                const [kontexte, orgaMap, rolleMap]: [
                    Personenkontext<true>[],
                    Map<OrganisationID, Organisation<true>>,
                    Map<RolleID, Rolle<true>>,
                ] = getPkArrayOrgaMapAndRolleMap(person);
                mockPersonenKontextRelatedRepositoryCalls(kontexte, orgaMap, rolleMap);
                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(
                    oeffentlicheSchulenDomain,
                );

                mockPersonAttributesFoundGroupsNotFound();

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Mismatch for givenName, person:${person.vorname}, LDAP:${givenName}, personId:${personId}, username:${username}`,
                );
                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Mismatch for surName, person:${person.familienname}, LDAP:${surName}, personId:${personId}, username:${username}`,
                );
                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Mismatch for cn, person:${person.username}, LDAP:${cn}, personId:${personId}, username:${username}`,
                );
            });
        });

        describe('when a member-relation is missing, an orphan member-relation exists and a corrupt group-dn exists', () => {
            const rolle1: Rolle<true> = getRolle();
            const orga1Kennung: string = faker.string.numeric({ length: 7 });
            const orga1: Organisation<true> = getOrga(orga1Kennung);
            const pk1: Personenkontext<true> = DoFactory.createPersonenkontext<true>(true, {
                organisationId: orga1.id,
                rolleId: rolle1.id,
                personId: personId,
            });

            const pks: Personenkontext<true>[] = [pk1];
            const orgaMap: Map<OrganisationID, Organisation<true>> = getOrgaMap(orga1);
            const rolleMap: Map<RolleID, Rolle<true>> = getRolleMap(rolle1);

            it('should log warnings regarding LDAP-groups, corrupt group-dn, add missing member-relationship and remove orphan member-relationship', async () => {
                mockPersonFoundEnabledAddressFoundDisabledAddressNotFound();

                mockPersonenKontextRelatedRepositoryCalls(pks, orgaMap, rolleMap);
                organisationRepositoryMock.findEmailDomainForOrganisation.mockResolvedValueOnce(
                    oeffentlicheSchulenDomain,
                );

                ldapClientAdapterMock.getPersonAttributes.mockResolvedValueOnce({
                    ok: true,
                    value: personAttributes,
                });

                const groupWithoutPkKennung: string = faker.string.numeric({ length: 7 });
                const groupWithoutPkDn: string = `cn=lehrer-${groupWithoutPkKennung},cn=groups,ou=${groupWithoutPkKennung},dc=schule-sh,dc=de`;
                const corruptGroupDn1: string = `cn=topanga-${groupWithoutPkKennung},cn=is,ou=${groupWithoutPkKennung},dc=hot,dc=tonight`;
                const corruptGroupDn2: string = `cn=these-${groupWithoutPkKennung},cn=groups,ou=${groupWithoutPkKennung},dc=are,dc=crazy`;
                //mock: LDAP-group for existing PK (orga1Kennung) is NOT found, but an LDAP-group for non-existing PK and a corrupt group-dn are found
                ldapClientAdapterMock.getGroupsForPerson.mockResolvedValueOnce({
                    ok: true,
                    value: [groupWithoutPkDn, corruptGroupDn1, corruptGroupDn2],
                });

                await sut.personExternalSystemSyncEventHandler(event);

                expect(loggerMock.info).toHaveBeenCalledWith(
                    `Syncing data to LDAP for personId:${personId}, username:${username}`,
                );
                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Added missing groupMembership for kennung:${orga1Kennung}`,
                );
                expect(loggerMock.warning).toHaveBeenCalledWith(
                    `Orphan group detected, no existing PK for groupDN:${groupWithoutPkDn}`,
                );
                expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Split on ,cn=groups, failed'));
            });
        });
    });
});
