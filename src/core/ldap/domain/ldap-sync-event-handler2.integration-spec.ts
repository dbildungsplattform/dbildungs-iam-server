import { MikroORM } from '@mikro-orm/core';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Attribute, Change, Client, Entry, SearchResult } from 'ldapts';
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
import { KafkaLdapSyncCompletedEvent } from '../../../shared/events/ldap/kafka-ldap-sync-completed.event.js';
import { LdapSyncCompletedEvent } from '../../../shared/events/ldap/ldap-sync-completed.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { PersonLdapSyncEvent } from '../../../shared/events/person-ldap-sync.event.js';
import { EventRoutingLegacyKafkaService } from '../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { LdapAdapter } from '../adapter/domain/ldap.adapter.js';
import { LdapConfigModule } from '../adapter/technical/ldap-config.module.js';
import { LdapInstanceConfig } from '../adapter/technical/ldap-instance-config.js';
import { LdapModule } from '../ldap.module.js';
import { LdapSyncEventHandler } from './ldap-sync-event-handler.js';
import { Mock } from 'vitest';
import { OrganisationKennung, PersonUsername } from '../../../shared/types/aggregate-ids.types.js';
import { EmailResolverService } from '../../../modules/email-microservice/domain/email-resolver.service.js';
import { EmailAddressStatus } from '../../../modules/email/domain/email-address.js';
import { PersonEmailResponse } from '../../../modules/person/api/person-email-response.js';

describe('LdapSyncEventHandler with PostgreSQL and LDAP', () => {
    let app: INestApplication;
    let orm: MikroORM;
    let sut: LdapSyncEventHandler;
    let personRepository: PersonRepository;
    let organisationRepository: OrganisationRepository;
    let rolleRepo: RolleRepo;
    let serviceProviderRepo: ServiceProviderRepo;
    let personenkontextRepo: DBiamPersonenkontextRepoInternal;
    let logger: DeepMocked<ClassLogger>;
    let eventService: DeepMocked<EventRoutingLegacyKafkaService>;
    let emailResolverService: DeepMocked<EmailResolverService>;
    let ldapAdapter: LdapAdapter;
    let ldap: Client;
    let ldapConfig: LdapInstanceConfig;
    let initialDns: Set<string>;
    let person: Person<true>;
    let rootOrga: Organisation<true>;
    let landOeffentlich: Organisation<true>;
    let schule: Organisation<true>;
    let rolleWithUem: Rolle<true>;
    let personenkontext: Personenkontext<true>;

    async function search(filter: string): Promise<Entry[]> {
        const result: SearchResult = await ldap.search(ldapConfig.BASE_DN, {
            scope: 'sub',
            filter,
            attributes: ['*', '+'],
        });
        return result.searchEntries;
    }

    async function createTeacher(): Promise<Entry> {
        await sut.triggerLdapSync(person.id);
        const entries: Entry[] = await search(`(uid=${person.username})`);
        assert(entries[0]);
        eventService.publish.mockClear();
        return entries[0];
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
            .overrideProvider(EmailResolverService)
            .useValue(createMock(EmailResolverService))
            .compile();

        orm = module.get(MikroORM);
        sut = module.get(LdapSyncEventHandler);
        personRepository = module.get(PersonRepository);
        organisationRepository = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        serviceProviderRepo = module.get(ServiceProviderRepo);
        personenkontextRepo = module.get(DBiamPersonenkontextRepoInternal);
        logger = module.get(ClassLogger);
        eventService = module.get(EventRoutingLegacyKafkaService);
        emailResolverService = module.get(EmailResolverService);
        ldapAdapter = module.get(LdapAdapter);
        ldapConfig = module.get(LdapInstanceConfig);
        ldapConfig.RETRY_WRAPPER_DEFAULT_RETRIES = 1;
        await DatabaseTestModule.setupDatabase(orm);
        app = module.createNestApplication();
        await app.init();

        ldap = new Client({ url: ldapConfig.URL });
        await ldap.bind(ldapConfig.BIND_DN, ldapConfig.ADMIN_PASSWORD);
        initialDns = new Set((await search('(objectClass=*)')).map((entry: Entry) => entry.dn));
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(async () => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
        emailResolverService.findEmailBySpshPerson.mockReset();
        emailResolverService.findEmailBySpshPerson.mockResolvedValue(undefined);
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
        eventService.publish.mockClear();
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

    it.each(['personExternalSystemSyncEventHandler', 'personLdapSyncEventHandler', 'triggerLdapSync'] as const)(
        '%s creates the LDAP person and persists its UUID',
        async (methodName: string) => {
            if (methodName === 'personExternalSystemSyncEventHandler') {
                await sut.personExternalSystemSyncEventHandler(new PersonExternalSystemsSyncEvent(person.id));
            } else if (methodName === 'personLdapSyncEventHandler') {
                await sut.personLdapSyncEventHandler(new PersonLdapSyncEvent(person.id));
            } else {
                await sut.triggerLdapSync(person.id);
            }

            const entries: Entry[] = await search(`(uid=${person.username})`);
            expect(entries).toHaveLength(1);
            const entry: Entry | undefined = entries[0];
            assert(entry);
            expect(entry['givenName']).toBe(person.vorname);
            expect(entry['sn']).toBe(person.familienname);
            expect(entry['cn']).toBe(person.username);
            expect(entry.dn).toContain('ou=oeffentlicheSchulen');
            orm.em.clear();
            const persistedPerson: Option<Person<true>> = await personRepository.findById(person.id);
            expect(persistedPerson?.externalIds.LDAP).toBe(entry['entryUUID']);
            expect(eventService.publish).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    personId: person.id,
                    username: person.username,
                    constructor: LdapSyncCompletedEvent,
                }),
                expect.objectContaining({
                    personId: person.id,
                    username: person.username,
                    constructor: KafkaLdapSyncCompletedEvent,
                }),
            );
        },
    );

    it('adds the person to the school group', async () => {
        await sut.triggerLdapSync(person.id);

        const entries: Entry[] = await search(`(uid=${person.username})`);
        const groups: Entry[] = await search(`(cn=lehrer-${schule.kennung})`);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.['member']).toBe(entries[0]?.dn);
    });

    it('keeps existing attributes, UUID and group membership on repeated sync', async () => {
        const teacher: Entry = await createTeacher();
        const savePerson: Mock<(person: Person<boolean>) => Promise<Person<true> | DomainError>> = vi.spyOn(
            personRepository,
            'save',
        );
        const addToGroup: Mock<
            (personUid: string, orgaKennung: OrganisationKennung, lehrerUid: string) => Promise<Result<boolean>>
        > = vi.spyOn(ldapAdapter, 'addPersonToGroup');
        const removeFromGroup: Mock<
            (username: PersonUsername, orgaKennung: OrganisationKennung, lehrerUid: string) => Promise<Result<boolean>>
        > = vi.spyOn(ldapAdapter, 'removePersonFromGroup');
        logger.warning.mockClear();

        await sut.triggerLdapSync(person.id);

        const entries: Entry[] = await search(`(uid=${person.username})`);
        expect(entries).toHaveLength(1);
        expect(entries[0]?.['entryUUID']).toBe(teacher['entryUUID']);
        expect(savePerson).not.toHaveBeenCalled();
        expect(addToGroup).not.toHaveBeenCalled();
        expect(removeFromGroup).not.toHaveBeenCalled();
        expect(logger.warning).toHaveBeenCalledExactlyOnceWith(
            `Mismatch for enabledEmailAddress, person:null, LDAP:empty, personId:${person.id}, username:${person.username}`,
        );
        expect(eventService.publish).toHaveBeenCalledOnce();
    });

    it('updates stale LDAP names from PostgreSQL', async () => {
        const teacher: Entry = await createTeacher();
        person.vorname = 'Updated';
        person.familienname = 'Surname';
        const savedPerson: Person<true> | DomainError = await personRepository.save(person);
        assert(savedPerson instanceof Person);
        logger.warning.mockClear();

        await sut.triggerLdapSync(person.id);

        const entries: Entry[] = await search(`(uid=${person.username})`);
        expect(entries[0]?.['givenName']).toBe('Updated');
        expect(entries[0]?.['sn']).toBe('Surname');
        expect(entries[0]?.['entryUUID']).toBe(teacher['entryUUID']);
        expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Mismatch for givenName'));
        expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Mismatch for surName'));
    });

    it('corrects a stale LDAP common name', async () => {
        const teacher: Entry = await createTeacher();
        await ldap.modify(
            teacher.dn,
            new Change({ operation: 'replace', modification: new Attribute({ type: 'cn', values: ['Stale name'] }) }),
        );
        logger.warning.mockClear();

        await sut.triggerLdapSync(person.id);

        const entries: Entry[] = await search(`(uid=${person.username})`);
        expect(entries[0]?.['cn']).toBe(person.username);
        expect(logger.warning).toHaveBeenCalledWith(expect.stringContaining('Mismatch for cn'));
        expect(eventService.publish).toHaveBeenCalledOnce();
    });

    it('replaces a stale LDAP email with the enabled email from the resolver', async () => {
        await createTeacher();
        const address: string = 'integration.teacher@schule-sh.de';
        emailResolverService.findEmailBySpshPerson.mockResolvedValue(
            new PersonEmailResponse(EmailAddressStatus.ENABLED, address),
        );

        await sut.triggerLdapSync(person.id);

        const entries: Entry[] = await search(`(uid=${person.username})`);
        expect(entries[0]?.['mailPrimaryAddress']).toBe(address);
        expect(emailResolverService.findEmailBySpshPerson).toHaveBeenLastCalledWith(person.id);
        expect(eventService.publish).toHaveBeenLastCalledWith(
            expect.objectContaining({ personId: person.id, constructor: LdapSyncCompletedEvent }),
            expect.objectContaining({ personId: person.id, constructor: KafkaLdapSyncCompletedEvent }),
        );
    });

    it('does not rewrite an already synchronized email address', async () => {
        const address: string = 'integration.teacher@schule-sh.de';
        emailResolverService.findEmailBySpshPerson.mockResolvedValue(
            new PersonEmailResponse(EmailAddressStatus.ENABLED, address),
        );
        await createTeacher();
        const changeEmail: Mock<LdapAdapter['changeEmailAddressByPersonId']> = vi.spyOn(
            ldapAdapter,
            'changeEmailAddressByPersonId',
        );
        logger.warning.mockClear();

        await sut.triggerLdapSync(person.id);

        const entries: Entry[] = await search(`(uid=${person.username})`);
        expect(entries[0]?.['mailPrimaryAddress']).toBe(address);
        expect(changeEmail).not.toHaveBeenCalled();
        expect(logger.warning).not.toHaveBeenCalled();
        expect(eventService.publish).toHaveBeenCalledOnce();
    });

    it.each([undefined, EmailAddressStatus.DISABLED, EmailAddressStatus.REQUESTED])(
        'retains the LDAP email when the resolver status is %s',
        async (status: EmailAddressStatus | undefined) => {
            const address: string = 'existing.teacher@schule-sh.de';
            emailResolverService.findEmailBySpshPerson.mockResolvedValue(
                new PersonEmailResponse(EmailAddressStatus.ENABLED, address),
            );
            await createTeacher();
            emailResolverService.findEmailBySpshPerson.mockResolvedValue(
                status === undefined ? undefined : new PersonEmailResponse(status, 'inactive.teacher@schule-sh.de'),
            );
            const changeEmail: Mock<LdapAdapter['changeEmailAddressByPersonId']> = vi.spyOn(
                ldapAdapter,
                'changeEmailAddressByPersonId',
            );

            await sut.triggerLdapSync(person.id);

            const entries: Entry[] = await search(`(uid=${person.username})`);
            expect(entries[0]?.['mailPrimaryAddress']).toBe(address);
            expect(changeEmail).not.toHaveBeenCalled();
            expect(eventService.publish).toHaveBeenCalledOnce();
        },
    );

    it('removes orphaned school membership while retaining current membership', async () => {
        const teacher: Entry = await createTeacher();
        assert(person.username);
        const result: Result<boolean> = await ldapAdapter.addPersonToGroup(person.username, '9000002', teacher.dn);
        assert(result.ok);

        await sut.triggerLdapSync(person.id);

        expect(await search('(cn=lehrer-9000002)')).toHaveLength(0);
        const currentGroups: Entry[] = await search(`(cn=lehrer-${schule.kennung})`);
        expect(currentGroups[0]?.['member']).toBe(teacher.dn);
    });

    it('leaves unrelated LDAP groups intact when their kennung cannot be extracted', async () => {
        const teacher: Entry = await createTeacher();
        const groupDn: string = `cn=unrelated,cn=groups,ou=${schule.kennung},${ldapConfig.BASE_DN}`;
        await ldap.add(groupDn, { cn: 'unrelated', objectClass: 'groupOfNames', member: teacher.dn });

        await sut.triggerLdapSync(person.id);

        expect(await search('(cn=unrelated)')).toHaveLength(1);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could NOT extract kennung'));
        expect(eventService.publish).toHaveBeenCalledOnce();
    });

    it('aborts when the person no longer exists', async () => {
        const missingPerson: Person<true> = DoFactory.createPerson(true);

        await sut.triggerLdapSync(missingPerson.id);

        expect(logger.error).toHaveBeenCalledWith(`Person with personId:${missingPerson.id} could not be found!`);
        expect(eventService.publish).not.toHaveBeenCalled();
        expect(await search(`(uid=${person.username})`)).toHaveLength(0);
    });

    it('aborts when the person has no username', async () => {
        person.username = undefined;
        vi.spyOn(personRepository, 'findById').mockResolvedValueOnce(person);

        await sut.triggerLdapSync(person.id);

        expect(logger.error).toHaveBeenCalledWith(`Person with personId:${person.id} has no username!`);
        expect(eventService.publish).not.toHaveBeenCalled();
        expect(await search('(uid=ldap-integration-teacher)')).toHaveLength(0);
    });

    it('aborts when the person has no UEM context', async () => {
        await personenkontextRepo.delete(personenkontext);
        eventService.publish.mockClear();

        await sut.triggerLdapSync(person.id);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('no organisations found for person'));
        expect(eventService.publish).not.toHaveBeenCalled();
        expect(await search(`(uid=${person.username})`)).toHaveLength(0);
    });

    it('aborts when the organisation hierarchy has no LDAP OU', async () => {
        landOeffentlich.uemLdapOu = undefined;
        await organisationRepository.save(landOeffentlich);
        eventService.publish.mockClear();

        await sut.triggerLdapSync(person.id);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('LDAP-root CANNOT be chosen'));
        expect(eventService.publish).not.toHaveBeenCalled();
        expect(await search(`(uid=${person.username})`)).toHaveLength(0);
    });

    it('aborts when a UEM context references a non-school organisation', async () => {
        await personenkontextRepo.delete(personenkontext);
        await personenkontextRepo.save(
            DoFactory.createPersonenkontext(false, {
                personId: person.id,
                organisationId: landOeffentlich.id,
                rolleId: rolleWithUem.id,
                befristung: undefined,
            }),
        );
        eventService.publish.mockClear();

        await sut.triggerLdapSync(person.id);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Could not find organisation'));
        expect(eventService.publish).not.toHaveBeenCalled();
        expect(await search(`(uid=${person.username})`)).toHaveLength(0);
    });

    it('aborts when a school has no kennung', async () => {
        schule.kennung = undefined;
        await organisationRepository.save(schule);
        eventService.publish.mockClear();

        await sut.triggerLdapSync(person.id);

        expect(logger.error).toHaveBeenCalledWith(
            `Required kennung is missing on organisation, orgaId:${schule.id}, pkId:${personenkontext.id}`,
        );
        expect(eventService.publish).not.toHaveBeenCalled();
        expect(await search(`(uid=${person.username})`)).toHaveLength(0);
    });

    it('aborts when LDAP attributes cannot be read', async () => {
        vi.spyOn(ldapAdapter, 'getPersonAttributes').mockResolvedValueOnce({
            ok: false,
            error: new Error('LDAP attributes unavailable'),
        });

        await sut.triggerLdapSync(person.id);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('LDAP attributes unavailable'));
        expect(eventService.publish).not.toHaveBeenCalled();
        expect(await search(`(uid=${person.username})`)).toHaveLength(0);
    });

    it('aborts without publishing completion when LDAP groups cannot be read', async () => {
        await createTeacher();
        vi.spyOn(ldapAdapter, 'getGroupsForPerson').mockResolvedValueOnce({
            ok: false,
            error: new Error('LDAP groups unavailable'),
        });

        await sut.triggerLdapSync(person.id);

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('LDAP groups unavailable'));
        expect(eventService.publish).not.toHaveBeenCalled();
    });
});
