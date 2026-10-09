import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client, Entry, SearchResult } from 'ldapts';
import assert from 'node:assert';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    LdapTestModule,
} from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../../../modules/organisation/domain/organisation.enums.js';
import { Organisation } from '../../../modules/organisation/domain/organisation.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { Person } from '../../../modules/person/domain/person.js';
import { PersonRepository } from '../../../modules/person/persistence/person.repository.js';
import { Personenkontext } from '../../../modules/personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepoInternal } from '../../../modules/personenkontext/persistence/internal-dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../modules/rolle/domain/rolle.enums.js';
import { Rolle } from '../../../modules/rolle/domain/rolle.js';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { ServiceProviderSystem } from '../../../modules/service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../../modules/service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../../modules/service-provider/repo/service-provider.repo.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { PersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/person-deleted-after-deadline-exceeded.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import { PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { EventRoutingLegacyKafkaService } from '../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { LdapConfigModule } from '../adapter/technical/ldap-config.module.js';
import { LdapInstanceConfig } from '../adapter/technical/ldap-instance-config.js';
import { LdapModule } from '../ldap.module.js';
import { LdapEventHandler } from './ldap-event-handler.js';

describe('LdapEventHandler with PostgreSQL and LDAP', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let sut: LdapEventHandler;
    let personRepository: PersonRepository;
    let organisationRepository: OrganisationRepository;
    let rolleRepo: RolleRepo;
    let serviceProviderRepo: ServiceProviderRepo;
    let personenkontextRepo: DBiamPersonenkontextRepoInternal;
    let logger: DeepMocked<ClassLogger>;
    let ldap: Client;
    let ldapConfig: LdapInstanceConfig;
    let initialDns: Set<string>;
    let person: Person<true>;
    let rootOrga: Organisation<true>;
    let landOeffentlich: Organisation<true>;
    let schule: Organisation<true>;
    let rolleWithUem: Rolle<true>;
    let personenkontext: Personenkontext<true>;
    let kontext: PersonenkontextEventKontextData;

    async function search(filter: string): Promise<Entry[]> {
        const result: SearchResult = await ldap.search(ldapConfig.BASE_DN, {
            scope: 'sub',
            filter,
            attributes: ['*', '+'],
        });
        return result.searchEntries;
    }

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LdapModule],
        })
            .overrideModule(LdapConfigModule)
            .useModule(LdapTestModule.forRoot({ isLdapRequired: true }))
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .overrideProvider(EventRoutingLegacyKafkaService)
            .useValue(createMock(EventRoutingLegacyKafkaService))
            .compile();

        orm = module.get(MikroORM);
        sut = module.get(LdapEventHandler);
        personRepository = module.get(PersonRepository);
        organisationRepository = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        serviceProviderRepo = module.get(ServiceProviderRepo);
        personenkontextRepo = module.get(DBiamPersonenkontextRepoInternal);
        logger = module.get(ClassLogger);
        ldapConfig = module.get(LdapInstanceConfig);
        ldapConfig.RETRY_WRAPPER_DEFAULT_RETRIES = 1;
        await DatabaseTestModule.setupDatabase(orm);
        app = module.createNestApplication();
        await app.init();

        ldap = new Client({ url: ldapConfig.URL });
        await ldap.bind(ldapConfig.BIND_DN, ldapConfig.ADMIN_PASSWORD);
        initialDns = new Set((await search('(objectClass=*)')).map((entry: Entry) => entry.dn));
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    async function createTeacher(): Promise<Entry> {
        const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
            new PersonenkontextUpdatedEvent(person, [kontext], [], [kontext]),
        );
        assert(result.ok, result.ok ? undefined : result.error.message);
        const entries: Entry[] = await search(`(uid=${person.username})`);
        assert(entries.length === 1 && entries[0]);
        return entries[0];
    }

    async function getTeacherGroup(): Promise<Entry[]> {
        return search(`(cn=lehrer-${schule.kennung})`);
    }

    beforeEach(async () => {
        logger.error.mockClear();
        logger.warning.mockClear();
        logger.logUnknownAsError.mockClear();
        await DatabaseTestModule.clearDatabase(orm);
        orm.em.clear();
        rootOrga = await organisationRepository.saveSeedData(
            DoFactory.createOrganisation(false, {
                id: organisationRepository.ROOT_ORGANISATION_ID,
                name: 'Integration root',
                typ: OrganisationsTyp.ROOT,
            }),
        );
        landOeffentlich = await organisationRepository.save(
            DoFactory.createOrganisation(false, {
                administriertVon: rootOrga.id,
                name: 'Öffentliche Schule',
                typ: OrganisationsTyp.LAND,
                uemLdapOu: 'oeffentlicheSchulen',
            }),
        );
        schule = await organisationRepository.save(
            DoFactory.createOrganisation(false, {
                kennung: '9000001',
                administriertVon: landOeffentlich.id,
                typ: OrganisationsTyp.SCHULE,
                uemLdapOu: undefined,
            }),
        );
        const savedPerson: Person<true> | DomainError = await personRepository.save(
            DoFactory.createPerson(false, {
                username: 'ldap-integration-teacher',
                vorname: 'Integration',
                familienname: 'Teacher',
                personalnummer: undefined,
            }),
        );
        assert(savedPerson instanceof Person);
        person = savedPerson;
        const serviceProvider: ServiceProvider<true> = await serviceProviderRepo.createUnsafe(
            DoFactory.createServiceProvider(false, {
                name: 'Integration UEM',
                providedOnSchulstrukturknoten: rootOrga.id,
                externalSystem: ServiceProviderSystem.UEM,
            }),
        );
        rolleWithUem = await rolleRepo.create(
            DoFactory.createRolle(false, {
                name: 'Integration teacher',
                administeredBySchulstrukturknoten: rootOrga.id,
                rollenart: RollenArt.LEHR,
                serviceProviderIds: [serviceProvider.id],
                istTechnisch: false,
            }),
        );
        personenkontext = await personenkontextRepo.save(
            DoFactory.createPersonenkontext(false, {
                personId: person.id,
                organisationId: schule.id,
                rolleId: rolleWithUem.id,
                befristung: undefined,
            }),
        );
        const event: PersonenkontextUpdatedEvent = PersonenkontextUpdatedEvent.fromPersonenkontexte(
            person,
            [[personenkontext, schule, rolleWithUem]],
            [],
            [[personenkontext, schule, rolleWithUem]],
        );
        assert(event.newKontexte[0]);
        kontext = event.newKontexte[0];
    });

    afterEach(async () => {
        const addedEntries: Entry[] = (await search('(objectClass=*)'))
            .filter((entry: Entry) => !initialDns.has(entry.dn))
            .sort((first: Entry, second: Entry) => second.dn.split(',').length - first.dn.split(',').length);
        await addedEntries.reduce(
            (cleanup: Promise<void>, entry: Entry): Promise<void> => cleanup.then(() => ldap.del(entry.dn)),
            Promise.resolve(),
        );
    });

    afterAll(async () => {
        await ldap?.unbind();
        await app?.close();
    });

    it('writes the teacher attributes to LDAP and persists the LDAP entry UUID in PostgreSQL', async () => {
        const event: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(person, [kontext], [], [kontext]);

        const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(event);

        expect(result).toEqual({ ok: true, value: null });
        const entries: Entry[] = await search(`(cn=${person.username})`);
        expect(entries).toHaveLength(1);
        const entry: Entry | undefined = entries[0];
        assert(entry);
        expect(entry['givenName']).toBe(person.vorname);
        expect(entry['sn']).toBe(person.familienname);
        expect(entry.dn).toContain('ou=oeffentlicheSchulen');
        expect(entry['entryUUID']).toEqual(expect.any(String));
        orm.em.clear();
        const persistedPerson: Option<Person<true>> = await personRepository.findById(person.id);
        expect(persistedPerson?.externalIds.LDAP).toBe(entry['entryUUID']);
    });

    it('adds the teacher DN to the school group', async () => {
        const entry: Entry = await createTeacher();

        const groups: Entry[] = await getTeacherGroup();

        expect(groups).toHaveLength(1);
        expect(groups[0]?.['member']).toBe(entry.dn);
    });

    it('does not duplicate an existing teacher or group membership when an event is delivered again', async () => {
        const entry: Entry = await createTeacher();

        await createTeacher();

        const entries: Entry[] = await search(`(uid=${person.username})`);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.['entryUUID']).toBe(entry['entryUUID']);
        expect((await getTeacherGroup())[0]?.['member']).toBe(entry.dn);
        orm.em.clear();
        expect((await personRepository.findById(person.id))?.externalIds.LDAP).toBe(entry['entryUUID']);
    });

    it('ignores new contexts without a UEM service provider', async () => {
        const nonUemKontext: PersonenkontextEventKontextData = { ...kontext, serviceProviderExternalSystems: [] };

        const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
            new PersonenkontextUpdatedEvent(person, [nonUemKontext], [], [nonUemKontext]),
        );

        expect(result.ok).toBe(true);
        expect(await search(`(uid=${person.username})`)).toEqual([]);
        expect(await getTeacherGroup()).toEqual([]);
        orm.em.clear();
        expect((await personRepository.findById(person.id))?.externalIds.LDAP).toBeUndefined();
    });

    it('removes the last school membership without deleting the teacher entry', async () => {
        const entry: Entry = await createTeacher();

        const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
            new PersonenkontextUpdatedEvent(person, [], [kontext], []),
        );

        expect(result.ok).toBe(true);
        expect(await getTeacherGroup()).toEqual([]);
        expect((await search(`(uid=${person.username})`))[0]?.['entryUUID']).toBe(entry['entryUUID']);
    });

    it('keeps school membership while another UEM context for that school remains', async () => {
        const entry: Entry = await createTeacher();
        const remainingKontext: PersonenkontextEventKontextData = {
            ...kontext,
            id: '00000000-0000-4000-8000-000000000003',
        };

        const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
            new PersonenkontextUpdatedEvent(person, [], [kontext], [remainingKontext]),
        );

        expect(result.ok).toBe(true);
        expect((await getTeacherGroup())[0]?.['member']).toBe(entry.dn);
    });

    it('removes school membership when only a non-UEM context for that school remains', async () => {
        await createTeacher();
        const remainingKontext: PersonenkontextEventKontextData = {
            ...kontext,
            id: '00000000-0000-4000-8000-000000000003',
            serviceProviderExternalSystems: [],
        };

        const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
            new PersonenkontextUpdatedEvent(person, [], [kontext], [remainingKontext]),
        );

        expect(result.ok).toBe(true);
        expect(await getTeacherGroup()).toEqual([]);
    });

    it('ignores removed contexts without a UEM service provider', async () => {
        const entry: Entry = await createTeacher();
        const nonUemKontext: PersonenkontextEventKontextData = { ...kontext, serviceProviderExternalSystems: [] };

        const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
            new PersonenkontextUpdatedEvent(person, [], [nonUemKontext], []),
        );

        expect(result.ok).toBe(true);
        expect((await getTeacherGroup())[0]?.['member']).toBe(entry.dn);
    });

    it.each(['creation', 'removal'])(
        'rejects %s with a missing school identifier without changing LDAP',
        async (operation: string) => {
            const invalidKontext: PersonenkontextEventKontextData = { ...kontext, orgaKennung: undefined };
            const before: Entry[] = await search('(objectClass=*)');

            const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
                new PersonenkontextUpdatedEvent(
                    person,
                    operation === 'creation' ? [invalidKontext] : [],
                    operation === 'removal' ? [invalidKontext] : [],
                    [],
                ),
            );

            expect(result.ok).toBe(false);
            expect(await search('(objectClass=*)')).toEqual(before);
        },
    );

    it.each(['creation', 'removal'])(
        'rejects %s when the database organisation has no LDAP OU',
        async (operation: string) => {
            const schuleWithoutUemLdapOu: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    kennung: '9000002',
                    administriertVon: rootOrga.id,
                    typ: OrganisationsTyp.SCHULE,
                    uemLdapOu: undefined,
                }),
            );
            const savedPerson: Person<true> | DomainError = await personRepository.save(
                DoFactory.createPerson(false, {}),
            );
            assert(savedPerson instanceof Person);
            const personWithoutOu: Person<true> = savedPerson;
            personenkontext = await personenkontextRepo.save(
                DoFactory.createPersonenkontext(false, {
                    personId: personWithoutOu.id,
                    organisationId: schuleWithoutUemLdapOu.id,
                    rolleId: rolleWithUem.id,
                    befristung: undefined,
                }),
            );
            const event: PersonenkontextUpdatedEvent = PersonenkontextUpdatedEvent.fromPersonenkontexte(
                personWithoutOu,
                operation === 'creation' ? [[personenkontext, schuleWithoutUemLdapOu, rolleWithUem]] : [],
                operation === 'removal' ? [[personenkontext, schuleWithoutUemLdapOu, rolleWithUem]] : [],
                [],
            );

            orm.em.clear();
            const before: Entry[] = await search('(objectClass=*)');

            const result: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(event);

            expect(result.ok).toBe(false);
            expect(await search('(objectClass=*)')).toEqual(before);
        },
    );

    it('updates the primary email using the persisted person, contexts and UEM role', async () => {
        await createTeacher();
        const event: EmailMicroserviceAddressChangedEvent = new EmailMicroserviceAddressChangedEvent(
            person.id,
            'teacher@example.org',
            undefined,
            undefined,
            undefined,
        );

        await sut.microserviceEmailChangedEventHandler(event);

        expect(logger.error.mock.calls).toEqual([]);
        expect(logger.logUnknownAsError.mock.calls).toEqual([]);
        expect((await search(`(uid=${person.username})`))[0]?.['mailPrimaryAddress']).toBe('teacher@example.org');
    });

    it('does not change LDAP when the email event has no new primary address', async () => {
        const entry: Entry = await createTeacher();

        await sut.microserviceEmailChangedEventHandler(
            new EmailMicroserviceAddressChangedEvent(person.id, undefined, undefined, undefined, undefined),
        );

        expect((await search(`(uid=${person.username})`))[0]?.['mailPrimaryAddress']).toBe(entry['mailPrimaryAddress']);
    });

    it('does not change email for a person without readable database contexts', async () => {
        const entry: Entry = await createTeacher();
        await personenkontextRepo.delete(personenkontext);
        orm.em.clear();

        await sut.microserviceEmailChangedEventHandler(
            new EmailMicroserviceAddressChangedEvent(person.id, 'teacher@example.org', undefined, undefined, undefined),
        );

        expect((await search(`(uid=${person.username})`))[0]?.['mailPrimaryAddress']).toBe(entry['mailPrimaryAddress']);
    });

    it('renames the LDAP entry and updates its names and group member DN', async () => {
        const entry: Entry = await createTeacher();
        assert(person.username);
        const event: PersonRenamedEvent = new PersonRenamedEvent(
            person.id,
            'Renamed',
            'Teachername',
            'ldap-renamed-teacher',
            person.vorname,
            person.familienname,
            person.username,
        );

        const result: Result<unknown> = await sut.personRenamedEventHandler(event);

        expect(result.ok).toBe(true);
        expect(await search(`(uid=${person.username})`)).toEqual([]);
        const entries: Entry[] = await search('(uid=ldap-renamed-teacher)');
        expect(entries).toHaveLength(1);
        expect(entries[0]?.['cn']).toBe('ldap-renamed-teacher');
        expect(entries[0]?.['givenName']).toBe('Renamed');
        expect(entries[0]?.['sn']).toBe('Teachername');
        expect(entries[0]?.['entryUUID']).toBe(entry['entryUUID']);
        expect((await getTeacherGroup())[0]?.['member']).toBe(entries[0]?.dn);
    });

    it('deletes the LDAP teacher after a person-deleted event', async () => {
        await createTeacher();
        assert(person.username);

        const result: Result<unknown> = await sut.handlePersonDeletedEvent(
            new PersonDeletedEvent(person.id, person.username),
        );

        expect(result.ok).toBe(true);
        expect(await search(`(uid=${person.username})`)).toEqual([]);
    });

    it('deletes the LDAP teacher after the deletion deadline expires', async () => {
        await createTeacher();
        assert(person.username);

        const result: Result<unknown> = await sut.handlePersonDeletedAfterDeadlineExceededEvent(
            new PersonDeletedAfterDeadlineExceededEvent(person.id, person.username, '123'),
        );

        expect(result.ok).toBe(true);
        expect(await search(`(uid=${person.username})`)).toEqual([]);
    });

    it('handles deletion of an already absent teacher idempotently', async () => {
        assert(person.username);

        const result: Result<unknown> = await sut.handlePersonDeletedEvent(
            new PersonDeletedEvent(person.id, person.username),
        );

        expect(result.ok).toBe(true);
        expect(await search(`(uid=${person.username})`)).toEqual([]);
    });

    it('deletes an empty school LDAP subtree without deleting the teacher entry', async () => {
        const entry: Entry = await createTeacher();
        const removalResult: Result<unknown> = await sut.handlePersonenkontextUpdatedEvent(
            new PersonenkontextUpdatedEvent(person, [], [kontext], []),
        );
        assert(removalResult.ok);

        const result: Result<unknown> = await sut.handleOrganisationDeletedEvent(
            OrganisationDeletedEvent.fromOrganisation(schule),
        );

        expect(logger.logUnknownAsError.mock.calls).toEqual([]);
        expect(result.ok).toBe(true);
        expect(await search(`(ou=${schule.kennung})`)).toEqual([]);
        expect(await getTeacherGroup()).toEqual([]);
        expect((await search(`(uid=${person.username})`))[0]?.['entryUUID']).toBe(entry['entryUUID']);
    });

    it('returns an error without removing a school that still contains LDAP groups', async () => {
        const entry: Entry = await createTeacher();

        const result: Result<unknown> = await sut.handleOrganisationDeletedEvent(
            OrganisationDeletedEvent.fromOrganisation(schule),
        );

        expect(result.ok).toBe(false);
        expect((await getTeacherGroup())[0]?.['member']).toBe(entry.dn);
        expect(await search(`(ou=${schule.kennung})`)).toHaveLength(1);
    });

    it.each([OrganisationsTyp.KLASSE, OrganisationsTyp.TRAEGER])(
        'does not delete the school subtree for organisation type %s',
        async (typ: OrganisationsTyp) => {
            const entry: Entry = await createTeacher();

            const result: Result<unknown> = await sut.handleOrganisationDeletedEvent(
                new OrganisationDeletedEvent(schule.id, schule.name, schule.kennung, typ),
            );

            expect(result.ok).toBe(true);
            expect((await getTeacherGroup())[0]?.['member']).toBe(entry.dn);
        },
    );
});
