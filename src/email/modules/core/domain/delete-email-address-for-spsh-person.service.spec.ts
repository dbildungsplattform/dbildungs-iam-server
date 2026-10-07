import { vi } from 'vitest';
import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggingTestModule } from '../../../../../test/utils/logging-test.module.js';
import { EmailAddressRepo } from '../persistence/email-address.repo.js';
import { DeleteEmailsAddressesForSpshPersonService } from './delete-email-adresses-for-spsh-person.service.js';
import { EmailAddress } from './email-address.js';
import { EmailAddressStatusEnum } from '../persistence/email-address-status.entity.js';
import { OxAdapter } from '../../ox/adapter/domain/ox.adapter.js';
import { LdapClientAdapter } from '../../ldap/adapter/domain/ldap-client.adapter.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { Ok, Err } from '../../../../shared/util/result.js';
import { OxNoSuchUserError } from '../../ox/adapter/domain/error/ox-no-such-user.error.js';
import { WebhookService } from '../../webhook/domain/webhook.service.js';
import { LdapUndiClientAdapter } from '../../ldap/adapter/domain/ldap-undi-client.adapter.js';

describe('DeleteEmailsAddressesForSpshPersonService', () => {
    let module: TestingModule;
    let sut: DeleteEmailsAddressesForSpshPersonService;
    let emailAddressRepoMock: DeepMocked<EmailAddressRepo>;
    let oxAdapterMock: DeepMocked<OxAdapter>;
    let ldapClientAdapterMock: DeepMocked<LdapClientAdapter>;
    let ldapUndiClientAdapterMock: DeepMocked<LdapUndiClientAdapter>;
    let loggerMock: DeepMocked<ClassLogger>;
    let webhookServiceMock: DeepMocked<WebhookService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                DeleteEmailsAddressesForSpshPersonService,
                {
                    provide: EmailAddressRepo,
                    useValue: createMock(EmailAddressRepo),
                },
                {
                    provide: OxAdapter,
                    useValue: createMock(OxAdapter),
                },
                {
                    provide: LdapClientAdapter,
                    useValue: createMock(LdapClientAdapter),
                },
                {
                    provide: LdapUndiClientAdapter,
                    useValue: createMock(LdapUndiClientAdapter),
                },
                {
                    provide: WebhookService,
                    useValue: createMock(WebhookService),
                },
            ],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();

        sut = module.get(DeleteEmailsAddressesForSpshPersonService);
        emailAddressRepoMock = module.get(EmailAddressRepo);
        oxAdapterMock = module.get(OxAdapter);
        ldapClientAdapterMock = module.get(LdapClientAdapter);
        ldapUndiClientAdapterMock = module.get(LdapUndiClientAdapter);
        loggerMock = module.get(ClassLogger);
        webhookServiceMock = module.get(WebhookService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        vi.restoreAllMocks();
    });

    function makeEmail(): EmailAddress<true> {
        return new EmailAddress(
            faker.string.uuid(),
            faker.date.past(),
            faker.date.recent(),
            faker.internet.email(),
            0,
            faker.string.uuid(),
            faker.string.uuid(),
            faker.string.uuid(),
            undefined,
            [{ status: EmailAddressStatusEnum.ACTIVE }],
        );
    }

    it('should log and return if no addresses found', async () => {
        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([]);
        const spshPersonId: string = faker.string.uuid();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(loggerMock.info).toHaveBeenCalledWith(
            `No email addresses found for spshPerson ${spshPersonId}. Skipping deletion.`,
        );
        expect(emailAddressRepoMock.save).not.toHaveBeenCalled();
    });

    it('should set status and markedForCron, save all, and delete from OX and LDAP, then delete from DB', async () => {
        oxAdapterMock.useOx.mockReturnValue(true);
        ldapClientAdapterMock.useLdap.mockReturnValue(true);
        ldapUndiClientAdapterMock.useLdap.mockReturnValue(true);

        const spshPersonId: string = faker.string.uuid();
        const oxUserCounter: string = faker.string.uuid();
        const externalId: string = faker.string.uuid();
        const domain: string = 'example.com';
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = oxUserCounter;
        email.externalId = externalId;
        vi.spyOn(email, 'getDomain').mockReturnValue(domain);

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        oxAdapterMock.deleteUser.mockResolvedValueOnce(Ok(undefined));
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok(undefined));
        ldapUndiClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok());
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(emailAddressRepoMock.save).toHaveBeenCalledWith(
            expect.objectContaining({
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                markedForCron: expect.any(Date),
            }),
        );
        expect(oxAdapterMock.deleteUser).toHaveBeenCalledWith(oxUserCounter);
        expect(ldapClientAdapterMock.deletePerson).toHaveBeenCalledWith(externalId, domain);
        expect(ldapUndiClientAdapterMock.deletePerson).toHaveBeenCalledWith(spshPersonId);
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(email);
        expect(loggerMock.info).toHaveBeenCalledWith(
            `Successfully deleted all email addresses for spshPerson ${spshPersonId} from DB.`,
        );
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should delete both email addresses but each external account only once', async () => {
        const spshPersonId: string = faker.string.uuid();
        const primaryEmail: EmailAddress<true> = makeEmail();
        primaryEmail.spshPersonId = spshPersonId;
        primaryEmail.address = 'primary@example.com';
        const alternativeEmail: EmailAddress<true> = makeEmail();
        alternativeEmail.spshPersonId = spshPersonId;
        alternativeEmail.address = 'alias@example.com';
        alternativeEmail.priority = 1;
        alternativeEmail.oxUserCounter = primaryEmail.oxUserCounter;
        alternativeEmail.externalId = primaryEmail.externalId;

        oxAdapterMock.useOx.mockReturnValue(true);
        ldapClientAdapterMock.useLdap.mockReturnValue(true);
        ldapUndiClientAdapterMock.useLdap.mockReturnValue(true);
        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([
            primaryEmail,
            alternativeEmail,
        ]);
        emailAddressRepoMock.save.mockResolvedValueOnce(Ok(primaryEmail)).mockResolvedValueOnce(Ok(alternativeEmail));
        oxAdapterMock.deleteUser.mockResolvedValueOnce(Ok());
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok());
        ldapUndiClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok());
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(oxAdapterMock.deleteUser).toHaveBeenCalledTimes(1);
        expect(ldapClientAdapterMock.deletePerson).toHaveBeenCalledTimes(1);
        expect(ldapUndiClientAdapterMock.deletePerson).toHaveBeenCalledTimes(1);
        expect(emailAddressRepoMock.delete).toHaveBeenCalledTimes(2);
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(primaryEmail);
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(alternativeEmail);
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: primaryEmail.address,
            previousAlternativeEmail: alternativeEmail.address,
        });
    });

    it('should log and skip OX deletion if oxUserCounter is missing', async () => {
        const spshPersonId: string = faker.string.uuid();
        const externalId: string = faker.string.uuid();
        const domain: string = 'example.com';
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = undefined;
        email.externalId = externalId;
        vi.spyOn(email, 'getDomain').mockReturnValue(domain);

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok(undefined));
        ldapUndiClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok());
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(loggerMock.warning).toHaveBeenCalledWith(
            `No oxUserCounter found for spshPerson ${spshPersonId} when deleting email addresses. Skipping Ox deletion`,
        );
        expect(oxAdapterMock.deleteUser).not.toHaveBeenCalled();
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(email);
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should log and skip LDAP deletion if domain is missing', async () => {
        const spshPersonId: string = faker.string.uuid();
        const externalId: string = faker.string.uuid();
        const oxUserCounter: string = faker.string.uuid();
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = oxUserCounter;
        email.externalId = externalId;
        vi.spyOn(email, 'getDomain').mockReturnValue(undefined);

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        oxAdapterMock.deleteUser.mockResolvedValueOnce(Ok(undefined));
        ldapUndiClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok());
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(loggerMock.warning).toHaveBeenCalledWith(
            `No externalId or domain found for spshPerson ${spshPersonId} when deleting email addresses. Skipping LDAP deletion`,
        );
        expect(ldapClientAdapterMock.deletePerson).not.toHaveBeenCalled();
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(email);
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should not delete from DB if OX deletion fails', async () => {
        oxAdapterMock.useOx.mockReturnValue(true);
        ldapClientAdapterMock.useLdap.mockReturnValue(true);
        ldapUndiClientAdapterMock.useLdap.mockReturnValue(true);

        const spshPersonId: string = faker.string.uuid();
        const oxUserCounter: string = faker.string.uuid();
        const externalId: string = faker.string.uuid();
        const domain: string = 'example.com';
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = oxUserCounter;
        email.externalId = externalId;
        vi.spyOn(email, 'getDomain').mockReturnValue(domain);

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        oxAdapterMock.deleteUser.mockResolvedValueOnce(Err(new Error('fail')));
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok(undefined));
        ldapUndiClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok());

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(ldapClientAdapterMock.deletePerson).toHaveBeenCalledWith(externalId, domain);
        expect(ldapUndiClientAdapterMock.deletePerson).toHaveBeenCalledWith(spshPersonId);
        expect(emailAddressRepoMock.delete).not.toHaveBeenCalled();
        expect(email.getStatus()).toBe(EmailAddressStatusEnum.TO_BE_DELETED);
        expect(email.markedForCron).toBeInstanceOf(Date);
        expect(loggerMock.warning).toHaveBeenCalledWith(
            `Could not delete all external representations for spshPerson ${spshPersonId}. Keeping email addresses in DB with status TO_BE_DELETED for retry.`,
        );
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should not delete from DB if LDAP deletion fails', async () => {
        oxAdapterMock.useOx.mockReturnValue(true);
        ldapClientAdapterMock.useLdap.mockReturnValue(true);

        const spshPersonId: string = faker.string.uuid();
        const oxUserCounter: string = faker.string.uuid();
        const externalId: string = faker.string.uuid();
        const domain: string = 'example.com';
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = oxUserCounter;
        email.externalId = externalId;
        vi.spyOn(email, 'getDomain').mockReturnValue(domain);

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        oxAdapterMock.deleteUser.mockResolvedValueOnce(Ok(undefined));
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Err(new Error('fail')));

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(emailAddressRepoMock.delete).not.toHaveBeenCalled();
        expect(loggerMock.warning).toHaveBeenCalledWith(
            `Could not delete all external representations for spshPerson ${spshPersonId}. Keeping email addresses in DB with status TO_BE_DELETED for retry.`,
        );
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should not delete from DB if LDAP UNDI deletion fails', async () => {
        oxAdapterMock.useOx.mockReturnValue(false);
        ldapClientAdapterMock.useLdap.mockReturnValue(false);
        ldapUndiClientAdapterMock.useLdap.mockReturnValue(true);

        const spshPersonId: string = faker.string.uuid();
        const oxUserCounter: string = faker.string.uuid();
        const externalId: string = faker.string.uuid();
        const domain: string = 'example.com';
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = oxUserCounter;
        email.externalId = externalId;
        vi.spyOn(email, 'getDomain').mockReturnValue(domain);

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        ldapUndiClientAdapterMock.deletePerson.mockResolvedValueOnce(Err(new Error('fail')));

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(emailAddressRepoMock.delete).not.toHaveBeenCalled();
        expect(loggerMock.warning).toHaveBeenCalledWith(
            `Could not delete all external representations for spshPerson ${spshPersonId}. Keeping email addresses in DB with status TO_BE_DELETED for retry.`,
        );
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should log info if OX user does not exist (OxNoSuchUserError)', async () => {
        oxAdapterMock.useOx.mockReturnValue(true);
        ldapClientAdapterMock.useLdap.mockReturnValue(true);

        const spshPersonId: string = faker.string.uuid();
        const oxUserCounter: string = faker.string.uuid();
        const externalId: string = faker.string.uuid();
        const domain: string = 'example.com';
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = oxUserCounter;
        email.externalId = externalId;
        vi.spyOn(email, 'getDomain').mockReturnValue(domain);

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        oxAdapterMock.deleteUser.mockResolvedValueOnce({ ok: false, error: new OxNoSuchUserError('no such user') });
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok(undefined));
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(loggerMock.info).toHaveBeenCalledWith(
            expect.stringContaining('does not exist in Ox anymore. Continuing deletion process.'),
        );
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(email);
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should return early and log if ox is disabled', async () => {
        oxAdapterMock.useOx.mockReturnValue(false);
        ldapClientAdapterMock.useLdap.mockReturnValue(true);

        const spshPersonId: string = faker.string.uuid();
        const email: EmailAddress<true> = makeEmail();

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok(undefined));
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('OX disabled -> faking deleteUser'));
        expect(oxAdapterMock.deleteUser).not.toHaveBeenCalled();
        expect(ldapClientAdapterMock.deletePerson).toHaveBeenCalled();
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(email);
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should return early and log if ldap is disabled', async () => {
        oxAdapterMock.useOx.mockReturnValue(true);
        ldapClientAdapterMock.useLdap.mockReturnValue(false);

        const spshPersonId: string = faker.string.uuid();
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = faker.string.uuid();

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        oxAdapterMock.deleteUser.mockResolvedValueOnce(Ok(undefined));
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('LDAP disabled -> faking deletePerson'));
        expect(ldapClientAdapterMock.deletePerson).not.toHaveBeenCalled();
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(email);
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });

    it('should return early and log if LDAP UNDI is disabled', async () => {
        oxAdapterMock.useOx.mockReturnValue(true);
        ldapClientAdapterMock.useLdap.mockReturnValue(true);
        ldapUndiClientAdapterMock.useLdap.mockReturnValue(false);

        const spshPersonId: string = faker.string.uuid();
        const email: EmailAddress<true> = makeEmail();
        email.oxUserCounter = faker.string.uuid();

        emailAddressRepoMock.findBySpshPersonIdSortedByPriorityAsc.mockResolvedValueOnce([email]);
        emailAddressRepoMock.save.mockResolvedValue(Ok(email));
        oxAdapterMock.deleteUser.mockResolvedValueOnce(Ok());
        ldapClientAdapterMock.deletePerson.mockResolvedValueOnce(Ok());
        emailAddressRepoMock.delete.mockResolvedValue();

        await sut.deleteEmailAddressesForSpshPerson({ spshPersonId });

        expect(loggerMock.info).toHaveBeenCalledWith(
            expect.stringContaining('LDAP UNDI disabled -> faking deletePerson'),
        );
        expect(ldapUndiClientAdapterMock.deletePerson).not.toHaveBeenCalled();
        expect(emailAddressRepoMock.delete).toHaveBeenCalledWith(email);
        expect(webhookServiceMock.sendEmailsChanged).toHaveBeenCalledWith({
            spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail: email.address,
            previousAlternativeEmail: undefined,
        });
    });
});
