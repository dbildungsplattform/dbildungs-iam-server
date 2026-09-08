import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../../test/utils/database-test.module.js';
import { EmailConfigTestModule } from '../../../../../test/utils/email-config-test.module.js';
import { LoggingTestModule } from '../../../../../test/utils/logging-test.module.js';
import { expectOkResult } from '../../../../../test/utils/test-types.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../../test/utils/timeouts.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { DomainError } from '../../../../shared/error/domain.error.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { LdapClientAdapter } from '../../ldap/adapter/domain/ldap-client.adapter.js';
import { OxAdapter } from '../../ox/adapter/domain/ox.adapter.js';
import { OxSendService } from '../../ox/adapter/technical/ox-send.service.js';
import { WebhookService } from '../../webhook/domain/webhook.service.js';
import { EmailAddressStatusEnum } from '../persistence/email-address-status.entity.js';
import { EmailAddressRepo } from '../persistence/email-address.repo.js';
import { EmailDomainRepo } from '../persistence/email-domain.repo.js';
import { CronDeleteEmailsAddressesService } from './cron-delete-email-addresses.service.js';
import { DeleteEmailsAddressesForSpshPersonService } from './delete-email-adresses-for-spsh-person.service.js';
import { EmailAddressGenerator } from './email-address-generator.js';
import { EmailAddress } from './email-address.js';
import { EmailDomain } from './email-domain.js';

describe('CronDeleteEmailsAddressesService', () => {
    let module: TestingModule;
    let sut: CronDeleteEmailsAddressesService;
    let orm: MikroORM;
    let loggerMock: DeepMocked<ClassLogger>;
    let deleteEmailsAddressesForSpshPersonServiceMock: DeepMocked<DeleteEmailsAddressesForSpshPersonService>;
    let emailAddressRepo: EmailAddressRepo;
    let emailDomainRepo: EmailDomainRepo;
    let oxSendServiceMock: DeepMocked<OxSendService>;
    let ldapClientAdapterMock: DeepMocked<LdapClientAdapter>;
    let oxAdapterMock: DeepMocked<OxAdapter>;
    let webhookServiceMock: DeepMocked<WebhookService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                LoggingTestModule,
                EmailConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
            ],
            providers: [
                CronDeleteEmailsAddressesService,
                EmailAddressRepo,
                EmailDomainRepo,
                {
                    provide: DeleteEmailsAddressesForSpshPersonService,
                    useValue: createMock(DeleteEmailsAddressesForSpshPersonService),
                },
                {
                    provide: EmailAddressGenerator,
                    useValue: createMock(EmailAddressGenerator),
                },
                {
                    provide: OxAdapter,
                    useValue: createMock(OxAdapter),
                },
                {
                    provide: OxSendService,
                    useValue: createMock(OxSendService),
                },
                {
                    provide: LdapClientAdapter,
                    useValue: createMock(LdapClientAdapter),
                },
                {
                    provide: WebhookService,
                    useValue: createMock(WebhookService),
                },
            ],
        }).compile();

        sut = module.get(CronDeleteEmailsAddressesService);
        orm = module.get(MikroORM);
        loggerMock = module.get(ClassLogger);
        emailAddressRepo = module.get(EmailAddressRepo);
        emailDomainRepo = module.get(EmailDomainRepo);
        oxSendServiceMock = module.get(OxSendService);
        ldapClientAdapterMock = module.get(LdapClientAdapter);
        oxAdapterMock = module.get(OxAdapter);
        deleteEmailsAddressesForSpshPersonServiceMock = module.get(DeleteEmailsAddressesForSpshPersonService);
        webhookServiceMock = module.get(WebhookService);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);

        vi.resetAllMocks();
        vi.restoreAllMocks();
    });

    async function setupDomain(): Promise<EmailDomain<true>> {
        return await emailDomainRepo.create(
            EmailDomain.createNew({
                domain: faker.internet.domainName(),
                spshServiceProviderId: faker.string.uuid(),
            }),
        );
    }

    async function createAndPersistEmail(
        spshPersonId: string,
        priority: number,
        markedForCron: Date | undefined,
        oxUserCounter: string | undefined,
        domain: EmailDomain<true>,
    ): Promise<EmailAddress<true>> {
        const mail: EmailAddress<false> = EmailAddress.createNew({
            address: `${faker.internet.username()}@${domain.domain}`,
            priority: priority,
            spshPersonId: spshPersonId,
            oxUserCounter: oxUserCounter,
            externalId: spshPersonId,
            markedForCron: markedForCron,
        });
        const result: Result<EmailAddress<true>, DomainError> = await emailAddressRepo.save(mail);

        expectOkResult(result);

        return result.value;
    }

    describe('CronDeleteEmailsAddressesService', () => {
        it('should remove emails with prio >=2 and marked_for_cron in past', async () => {
            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const personId2: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();
            const emailPerson1Prio0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                faker.string.uuid(),
                domain,
            );
            const emailPerson1Prio1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                undefined,
                faker.string.uuid(),
                domain,
            );
            const emailPerson1Prio2: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                2,
                oneDayInPast,
                faker.string.uuid(),
                domain,
            );
            const emailPerson1Prio3: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                3,
                undefined,
                faker.string.uuid(),
                domain,
            );
            const emailPerson2Prio2: EmailAddress<true> = await createAndPersistEmail(
                personId2,
                2,
                undefined,
                faker.string.uuid(),
                domain,
            );
            const emailPerson2Prio3: EmailAddress<true> = await createAndPersistEmail(
                personId2,
                3,
                oneDayInPast,
                faker.string.uuid(),
                domain,
            );

            await sut.deleteEmailAddresses();
            const isExistsEmailPerson1Prio0: boolean = await emailAddressRepo.existsEmailAddress(
                emailPerson1Prio0.address,
            );
            const isExistsEmailPerson1Prio1: boolean = await emailAddressRepo.existsEmailAddress(
                emailPerson1Prio1.address,
            );
            const isExistsEmailPerson1Prio2: boolean = await emailAddressRepo.existsEmailAddress(
                emailPerson1Prio2.address,
            );
            const isExistsEmailPerson1Prio3: boolean = await emailAddressRepo.existsEmailAddress(
                emailPerson1Prio3.address,
            );
            const isExistsEmailPerson2Prio2: boolean = await emailAddressRepo.existsEmailAddress(
                emailPerson2Prio2.address,
            );
            const isExistsEmailPerson3Prio3: boolean = await emailAddressRepo.existsEmailAddress(
                emailPerson2Prio3.address,
            );

            expect(isExistsEmailPerson1Prio0).toBeTruthy();
            expect(isExistsEmailPerson1Prio1).toBeTruthy();
            expect(isExistsEmailPerson1Prio2).toBeFalsy();
            expect(isExistsEmailPerson1Prio3).toBeTruthy();
            expect(isExistsEmailPerson2Prio2).toBeTruthy();
            expect(isExistsEmailPerson3Prio3).toBeFalsy();

            expect(loggerMock.info).not.toHaveBeenCalledWith(
                `Processing Emails with Prio < 2 for spshPerson ${personId1}`,
            );
            expect(loggerMock.info).not.toHaveBeenCalledWith(
                `Processing Emails with Prio < 2 for spshPerson ${personId2}`,
            );
            // Should not be called because neither primary nor alternative email changed
            expect(webhookServiceMock.sendEmailsChanged).not.toHaveBeenCalled();
        });

        it('should use DeleteEmailsAddressesForSpshPersonService to remove all entries external representations', async () => {
            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            await createAndPersistEmail(personId1, 0, oneDayInPast, faker.string.uuid(), domain);
            await createAndPersistEmail(personId1, 1, oneDayInPast, faker.string.uuid(), domain);
            await createAndPersistEmail(personId1, 2, oneDayInPast, faker.string.uuid(), domain);
            await createAndPersistEmail(personId1, 3, oneDayInPast, faker.string.uuid(), domain);

            await sut.deleteEmailAddresses();

            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).toHaveBeenLastCalledWith({ spshPersonId: personId1 });
            // Should not be called because neither primary nor alternative email changed
            expect(webhookServiceMock.sendEmailsChanged).not.toHaveBeenCalled();
        });

        it('should keep the primary mail and remove only the alternative mail', async () => {
            oxAdapterMock.useOx.mockReturnValue(true);
            ldapClientAdapterMock.useLdap.mockReturnValue(true);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                oxUserCounter,
                domain,
            );
            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                oxUserCounter,
                domain,
            );

            oxSendServiceMock.send.mockResolvedValueOnce(Ok(undefined));
            ldapClientAdapterMock.updatePersonEmails.mockResolvedValueOnce(Ok(''));

            await sut.deleteEmailAddresses();

            const isExistsEmailPrio0: boolean = await emailAddressRepo.existsEmailAddress(email0.address);
            const isExistsEmailPrio1: boolean = await emailAddressRepo.existsEmailAddress(email1.address);

            expect(isExistsEmailPrio0).toBeTruthy();
            expect(isExistsEmailPrio1).toBeFalsy();
            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).toHaveBeenCalledWith(
                oxUserCounter,
                undefined,
                [email0.address],
                undefined,
                undefined,
                undefined,
                email0.address,
                email0.address,
            );
            expect(ldapClientAdapterMock.updatePersonEmails).toHaveBeenCalledWith(
                email0.externalId,
                domain.domain,
                email0.address,
                undefined,
            );
            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });

        it('should still remove the alternative mail from db if ox user counter not found', async () => {
            oxAdapterMock.useOx.mockReturnValue(true);
            ldapClientAdapterMock.useLdap.mockReturnValue(true);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const oxUserCounter: undefined = undefined;
            const domain: EmailDomain<true> = await setupDomain();

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                oxUserCounter,
                domain,
            );
            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                oxUserCounter,
                domain,
            );

            oxSendServiceMock.send.mockResolvedValueOnce(Ok(''));
            ldapClientAdapterMock.updatePersonEmails.mockResolvedValueOnce(Ok(''));

            await sut.deleteEmailAddresses();

            const isExistsEmailPrio0: boolean = await emailAddressRepo.existsEmailAddress(email0.address);
            const isExistsEmailPrio1: boolean = await emailAddressRepo.existsEmailAddress(email1.address);
            await emailAddressRepo.findEmailAddress(email1.address);

            expect(isExistsEmailPrio0).toBeTruthy();
            expect(isExistsEmailPrio1).toBeFalsy();

            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).not.toHaveBeenCalled();
            expect(ldapClientAdapterMock.updatePersonEmails).toHaveBeenCalledWith(
                email0.externalId,
                domain.domain,
                email0.address,
                undefined,
            );
            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });

        it('should fallback to oxUserCounter from prio 0 address if oxUserCounter from prio 1 address is missing', async () => {
            oxAdapterMock.useOx.mockReturnValue(true);
            ldapClientAdapterMock.useLdap.mockReturnValue(true);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                faker.string.uuid(),
                domain,
            );
            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                undefined,
                domain,
            );

            oxSendServiceMock.send.mockResolvedValueOnce(Ok(''));
            ldapClientAdapterMock.updatePersonEmails.mockResolvedValueOnce(Ok(''));

            await sut.deleteEmailAddresses();

            const isExistsEmailPrio0: boolean = await emailAddressRepo.existsEmailAddress(email0.address);
            const isExistsEmailPrio1: boolean = await emailAddressRepo.existsEmailAddress(email1.address);
            await emailAddressRepo.findEmailAddress(email1.address);

            expect(isExistsEmailPrio0).toBeTruthy();
            expect(isExistsEmailPrio1).toBeFalsy();

            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).toHaveBeenCalled();
            expect(ldapClientAdapterMock.updatePersonEmails).toHaveBeenCalledWith(
                email0.externalId,
                domain.domain,
                email0.address,
                undefined,
            );
            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });

        it('should fail removing the alternative mail due to ox error and leave email in status TO_BE_DELETED', async () => {
            oxAdapterMock.useOx.mockReturnValue(true);
            ldapClientAdapterMock.useLdap.mockReturnValue(true);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                oxUserCounter,
                domain,
            );
            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                oxUserCounter,
                domain,
            );

            oxSendServiceMock.send.mockResolvedValueOnce(Err(new Error('') as DomainError));
            ldapClientAdapterMock.updatePersonEmails.mockResolvedValueOnce(Ok(''));

            await sut.deleteEmailAddresses();

            const isExistsEmailPrio0: boolean = await emailAddressRepo.existsEmailAddress(email0.address);
            const isExistsEmailPrio1: boolean = await emailAddressRepo.existsEmailAddress(email1.address);
            const emailAddress1AfterProcessing: Option<EmailAddress<true>> = await emailAddressRepo.findEmailAddress(
                email1.address,
            );

            expect(isExistsEmailPrio0).toBeTruthy();
            expect(isExistsEmailPrio1).toBeTruthy();
            expect(emailAddress1AfterProcessing).toBeDefined();

            if (!emailAddress1AfterProcessing) {
                return;
            }

            expect(emailAddress1AfterProcessing.getStatus()).toBe(EmailAddressStatusEnum.TO_BE_DELETED);

            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).toHaveBeenCalledWith(
                oxUserCounter,
                undefined,
                [email0.address],
                undefined,
                undefined,
                undefined,
                email0.address,
                email0.address,
            );
            expect(ldapClientAdapterMock.updatePersonEmails).toHaveBeenCalledWith(
                email0.externalId,
                domain.domain,
                email0.address,
                undefined,
            );
            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });

        it('should fail removing the alternative mail due ldap domain missing and leave email in status TO_BE_DELETED', async () => {
            oxAdapterMock.useOx.mockReturnValue(true);
            ldapClientAdapterMock.useLdap.mockReturnValue(true);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.uuid();
            const domain: EmailDomain<true> = {} as unknown as EmailDomain<true>;
            domain.domain = '';

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                oxUserCounter,
                domain,
            );
            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                oxUserCounter,
                domain,
            );

            oxSendServiceMock.send.mockResolvedValueOnce(Ok(undefined));

            await sut.deleteEmailAddresses();

            const isExistsEmailPrio0: boolean = await emailAddressRepo.existsEmailAddress(email0.address);
            const isExistsEmailPrio1: boolean = await emailAddressRepo.existsEmailAddress(email1.address);
            const emailAddress1AfterProcessing: Option<EmailAddress<true>> = await emailAddressRepo.findEmailAddress(
                email1.address,
            );

            expect(isExistsEmailPrio0).toBeTruthy();
            expect(isExistsEmailPrio1).toBeTruthy();
            expect(emailAddress1AfterProcessing).toBeDefined();

            if (!emailAddress1AfterProcessing) {
                return;
            }

            expect(emailAddress1AfterProcessing.getStatus()).toBe(EmailAddressStatusEnum.TO_BE_DELETED);

            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).toHaveBeenCalledWith(
                oxUserCounter,
                undefined,
                [email0.address],
                undefined,
                undefined,
                undefined,
                email0.address,
                email0.address,
            );
            expect(ldapClientAdapterMock.updatePersonEmails).not.toHaveBeenCalled();
            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });

        it('should fail removing the alternative mail due to ldap error and leave email in status TO_BE_DELETED', async () => {
            oxAdapterMock.useOx.mockReturnValue(true);
            ldapClientAdapterMock.useLdap.mockReturnValue(true);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                oxUserCounter,
                domain,
            );
            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                oxUserCounter,
                domain,
            );

            oxSendServiceMock.send.mockResolvedValueOnce(Ok(undefined));
            ldapClientAdapterMock.updatePersonEmails.mockResolvedValueOnce(Err(new Error('') as DomainError));

            await sut.deleteEmailAddresses();

            const isExistsEmailPrio0: boolean = await emailAddressRepo.existsEmailAddress(email0.address);
            const isExistsEmailPrio1: boolean = await emailAddressRepo.existsEmailAddress(email1.address);
            const emailAddress1AfterProcessing: Option<EmailAddress<true>> = await emailAddressRepo.findEmailAddress(
                email1.address,
            );

            expect(isExistsEmailPrio0).toBeTruthy();
            expect(isExistsEmailPrio1).toBeTruthy();
            expect(emailAddress1AfterProcessing).toBeDefined();

            if (!emailAddress1AfterProcessing) {
                return;
            }

            expect(emailAddress1AfterProcessing.getStatus()).toBe(EmailAddressStatusEnum.TO_BE_DELETED);

            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).toHaveBeenCalledWith(
                oxUserCounter,
                undefined,
                [email0.address],
                undefined,
                undefined,
                undefined,
                email0.address,
                email0.address,
            );
            expect(ldapClientAdapterMock.updatePersonEmails).toHaveBeenCalledWith(
                email0.externalId,
                domain.domain,
                email0.address,
                undefined,
            );
            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });

        it('should fail when the only remaining email to be deleted is not the alternative', async () => {
            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                oneDayInPast,
                oxUserCounter,
                domain,
            );
            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                oxUserCounter,
                domain,
            );
            await createAndPersistEmail(personId1, -50, undefined, oxUserCounter, domain);

            oxSendServiceMock.send.mockResolvedValueOnce(Ok(undefined));
            ldapClientAdapterMock.updatePersonEmails.mockResolvedValueOnce(Ok(''));

            await sut.deleteEmailAddresses();

            const isExistsEmailPrio0: boolean = await emailAddressRepo.existsEmailAddress(email0.address);
            const isExistsEmailPrio1: boolean = await emailAddressRepo.existsEmailAddress(email1.address);

            expect(isExistsEmailPrio0).toBeTruthy();
            expect(isExistsEmailPrio1).toBeTruthy();
            expect(loggerMock.info).toHaveBeenCalledWith(`Processing Emails with Prio < 2 for spshPerson ${personId1}`);
            expect(loggerMock.error).toHaveBeenCalledWith(
                `When not the Entire Person is deleted, the primary Email (Prio 0) must remain and alternative Email (Prio 1) must be deleted`,
            );
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).not.toHaveBeenCalled();
            expect(ldapClientAdapterMock.updatePersonEmails).not.toHaveBeenCalled();
            expect(webhookServiceMock.sendEmailsChanged).not.toHaveBeenCalled();
        });

        it('should log "OX is disabled -> faking OX change user action" and still remove prio1 from DB', async () => {
            oxAdapterMock.useOx.mockReturnValue(false);
            ldapClientAdapterMock.useLdap.mockReturnValue(true);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            const oxUserCounter: string = '123456';

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                oxUserCounter,
                domain,
            );

            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                undefined,
                domain,
            );

            ldapClientAdapterMock.updatePersonEmails.mockResolvedValueOnce(Ok(''));

            await sut.deleteEmailAddresses();

            expect(await emailAddressRepo.existsEmailAddress(email0.address)).toBeTruthy();
            expect(await emailAddressRepo.existsEmailAddress(email1.address)).toBeFalsy();

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('OX is disabled -> faking OX change user action'),
            );
            expect(oxSendServiceMock.send).not.toHaveBeenCalled();
            expect(oxAdapterMock.createChangeUserAction).not.toHaveBeenCalled();

            expect(ldapClientAdapterMock.updatePersonEmails).toHaveBeenCalledWith(
                email0.externalId,
                domain.domain,
                email0.address,
                undefined,
            );

            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });

        it('should log "LDAP is disabled -> faking LDAP email update" and still remove prio1 from DB', async () => {
            oxAdapterMock.useOx.mockReturnValue(true);
            ldapClientAdapterMock.useLdap.mockReturnValue(false);

            const oneDayInPast: Date = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const personId1: string = faker.string.uuid();
            const domain: EmailDomain<true> = await setupDomain();

            const oxUserCounter: string = '123456';

            const email0: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                0,
                undefined,
                oxUserCounter,
                domain,
            );

            const email1: EmailAddress<true> = await createAndPersistEmail(
                personId1,
                1,
                oneDayInPast,
                undefined,
                domain,
            );

            oxSendServiceMock.send.mockResolvedValueOnce(Ok(undefined));

            await sut.deleteEmailAddresses();

            expect(await emailAddressRepo.existsEmailAddress(email0.address)).toBeTruthy();
            expect(await emailAddressRepo.existsEmailAddress(email1.address)).toBeFalsy();

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('LDAP is disabled -> faking LDAP email update'),
            );
            expect(ldapClientAdapterMock.updatePersonEmails).not.toHaveBeenCalled();

            expect(oxAdapterMock.createChangeUserAction).toHaveBeenCalled();
            expect(oxSendServiceMock.send).toHaveBeenCalled();

            expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
                spshPersonId: personId1,
                newPrimaryEmail: email0.address,
                newAlternativeEmail: undefined,
                previousPrimaryEmail: email0.address,
                previousAlternativeEmail: email1.address,
            });
        });
    });
});
