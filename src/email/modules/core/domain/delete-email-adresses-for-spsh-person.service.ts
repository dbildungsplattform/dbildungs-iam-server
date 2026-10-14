import { Injectable } from '@nestjs/common';
import { EmailAddressRepo } from '../persistence/email-address.repo.js';
import { EmailAddress } from './email-address.js';
import { EmailAddressStatusEnum } from '../persistence/email-address-status.entity.js';
import { OxAdapter } from '../../ox/adapter/domain/ox.adapter.js';
import { OXUserID } from '../../../../shared/types/ox-ids.types.js';
import { LdapClientAdapter } from '../../ldap/adapter/domain/ldap-client.adapter.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { OxNoSuchUserError } from '../../ox/adapter/domain/error/ox-no-such-user.error.js';
import { WebhookService } from '../../webhook/domain/webhook.service.js';
import { Ok } from '../../../../shared/util/result.js';
import { LdapUndiClientAdapter } from '../../ldap/adapter/domain/ldap-undi-client.adapter.js';

@Injectable()
export class DeleteEmailsAddressesForSpshPersonService {
    public constructor(
        private readonly emailAddressRepo: EmailAddressRepo,
        private readonly oxAdapter: OxAdapter,
        private readonly logger: ClassLogger,
        private readonly ldapClientAdapter: LdapClientAdapter,
        private readonly ldapUndiClientAdapter: LdapUndiClientAdapter,
        private readonly webhookService: WebhookService,
    ) {}

    public async deleteEmailAddressesForSpshPerson(params: { spshPersonId: string }): Promise<void> {
        const spshPersonId: string = params.spshPersonId;
        this.logger.info(`Received request to delete all email addresses for spshPerson ${spshPersonId}.`);

        const personEmailAddresses: EmailAddress<true>[] =
            await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);

        if (personEmailAddresses.length === 0) {
            this.logger.info(`No email addresses found for spshPerson ${spshPersonId}. Skipping deletion.`);
            return;
        }

        await this.markEmailAddressesForDeletion(personEmailAddresses);
        const canDeleteFromDatabase: boolean = await this.deleteExternalAccounts(spshPersonId, personEmailAddresses);

        if (canDeleteFromDatabase) {
            await this.deleteEmailAddressesFromDatabase(spshPersonId, personEmailAddresses);
        } else {
            this.logger.warning(
                `Could not delete all external representations for spshPerson ${spshPersonId}. Keeping email addresses in DB with status TO_BE_DELETED for retry.`,
            );
        }

        this.notifyEmailAddressesChanged(spshPersonId, personEmailAddresses);
    }

    private async markEmailAddressesForDeletion(personEmailAddresses: EmailAddress<true>[]): Promise<void> {
        personEmailAddresses.forEach((emailAddress: EmailAddress<true>) => {
            emailAddress.setStatus(EmailAddressStatusEnum.TO_BE_DELETED);
            emailAddress.markedForCron = new Date();
        });

        await Promise.all(
            personEmailAddresses.map((emailAddress: EmailAddress<true>) => this.emailAddressRepo.save(emailAddress)),
        );
    }

    private async deleteExternalAccounts(
        spshPersonId: string,
        personEmailAddresses: EmailAddress<true>[],
    ): Promise<boolean> {
        const oxUserCounter: OXUserID | undefined = this.findOxUserCounter(personEmailAddresses);
        const externalId: string | undefined = this.findExternalId(personEmailAddresses);
        const domain: string | undefined = this.findEmailDomain(personEmailAddresses);

        const oxAllowsDatabaseDeletion: boolean = await this.deleteOxUser(
            spshPersonId,
            oxUserCounter,
            personEmailAddresses,
        );
        const ldapAllowsDatabaseDeletion: boolean = await this.deleteLdapPerson(
            spshPersonId,
            externalId,
            domain,
            personEmailAddresses,
        );
        const undiLdapAllowsDatabaseDeletion: boolean = await this.deleteUndiLdapPerson(spshPersonId);

        const isDeletionSuccessful: boolean =
            oxAllowsDatabaseDeletion && ldapAllowsDatabaseDeletion && undiLdapAllowsDatabaseDeletion;

        return isDeletionSuccessful;
    }

    private findOxUserCounter(personEmailAddresses: EmailAddress<true>[]): OXUserID | undefined {
        return personEmailAddresses.find((emailAddress: EmailAddress<true>) => emailAddress.oxUserCounter)
            ?.oxUserCounter;
    }

    private findExternalId(personEmailAddresses: EmailAddress<true>[]): string | undefined {
        return personEmailAddresses.find((emailAddress: EmailAddress<true>) => emailAddress.externalId)?.externalId;
    }

    private findEmailDomain(personEmailAddresses: EmailAddress<true>[]): string | undefined {
        return personEmailAddresses.find((emailAddress: EmailAddress<true>) => emailAddress.getDomain())?.getDomain();
    }

    private async deleteOxUser(
        spshPersonId: string,
        oxUserCounter: OXUserID | undefined,
        personEmailAddresses: EmailAddress<true>[],
    ): Promise<boolean> {
        if (!oxUserCounter) {
            this.logger.warning(
                `No oxUserCounter found for spshPerson ${spshPersonId} when deleting email addresses. Skipping Ox deletion`,
            );

            return true;
        }

        //Deleting the Group Relations extra is not necessary as Ox deletes them automatically when deleting the user
        let deleteUserResult: Result<void, Error>;
        if (!this.oxAdapter.useOx()) {
            const oxUserAddresses: object = personEmailAddresses.map((emailAddress: EmailAddress<true>) => ({
                address: emailAddress.address,
                priority: emailAddress.priority,
                externalId: emailAddress.externalId,
            }));
            this.logger.info(
                `OX disabled -> faking deleteUser. Data: oxUserCounter=${oxUserCounter}, addresses=${JSON.stringify(oxUserAddresses)}`,
            );

            deleteUserResult = Ok(undefined);
        } else {
            deleteUserResult = await this.oxAdapter.deleteUser(oxUserCounter);
        }

        if (deleteUserResult.ok) {
            this.logger.info(
                `Successfully deleted for spshPerson ${spshPersonId} the corresponding Ox user ${oxUserCounter}.`,
            );

            return true;
        }

        if (deleteUserResult.error instanceof OxNoSuchUserError) {
            this.logger.info(
                `User for spshPerson ${spshPersonId} with Ox user id ${oxUserCounter} does not exist in Ox anymore. Continuing deletion process.`,
            );

            return true;
        }

        return false;
    }

    private async deleteLdapPerson(
        spshPersonId: string,
        externalId: string | undefined,
        domain: string | undefined,
        personEmailAddresses: EmailAddress<true>[],
    ): Promise<boolean> {
        if (!externalId || !domain) {
            this.logger.warning(
                `No externalId or domain found for spshPerson ${spshPersonId} when deleting email addresses. Skipping LDAP deletion`,
            );
            return true;
        }

        let deleteLdapPersonResult: Result<void, Error>;
        if (!this.ldapClientAdapter.useLdap()) {
            const ldapUserAddresses: object = personEmailAddresses.map((emailAddress: EmailAddress<true>) => ({
                address: emailAddress.address,
                priority: emailAddress.priority,
                externalId: emailAddress.externalId,
            }));

            this.logger.info(
                `LDAP disabled -> faking deletePerson. Data: externalId=${externalId}, domain=${domain}, addresses=${JSON.stringify(
                    ldapUserAddresses,
                )}`,
            );

            deleteLdapPersonResult = Ok(undefined);
        } else {
            deleteLdapPersonResult = await this.ldapClientAdapter.deletePerson(externalId, domain);
        }

        if (deleteLdapPersonResult.ok) {
            this.logger.info(
                `Successfully deleted for spshPerson ${spshPersonId} the LDAP user with uid: ${externalId} in domain ${domain}.`,
            );

            return true;
        }

        return false;
    }

    private async deleteUndiLdapPerson(spshPersonId: string): Promise<boolean> {
        if (!this.ldapUndiClientAdapter.useLdap()) {
            this.logger.info(`LDAP UNDI disabled -> faking deletePerson. Data: spshPersonId=${spshPersonId}`);
            return true;
        }

        const ldapUndiDeleteResult: Result<void> = await this.ldapUndiClientAdapter.deletePerson(spshPersonId);

        if (ldapUndiDeleteResult.ok) {
            this.logger.info(`Successfully deleted person ${spshPersonId} in UNDI LDAP`);

            return true;
        }

        this.logger.logUnknownAsError(
            `Could not delete person ${spshPersonId} in UNDI LDAP`,
            ldapUndiDeleteResult.error,
        );

        return false;
    }

    private async deleteEmailAddressesFromDatabase(
        spshPersonId: string,
        personEmailAddresses: EmailAddress<true>[],
    ): Promise<void> {
        const deletePromises: Promise<void>[] = personEmailAddresses.map((emailAddress: EmailAddress<true>) =>
            this.emailAddressRepo.delete(emailAddress),
        );
        await Promise.all(deletePromises);
        this.logger.info(`Successfully deleted all email addresses for spshPerson ${spshPersonId} from DB.`);
    }

    private findEmailAddressByPriority(
        personEmailAddresses: EmailAddress<true>[],
        priority: number,
    ): string | undefined {
        return personEmailAddresses.find((emailAddress: EmailAddress<true>) => emailAddress.priority === priority)
            ?.address;
    }

    private notifyEmailAddressesChanged(spshPersonId: string, personEmailAddresses: EmailAddress<true>[]): void {
        const previousPrimaryEmail: string | undefined = this.findEmailAddressByPriority(personEmailAddresses, 0);
        const previousAlternativeEmail: string | undefined = this.findEmailAddressByPriority(personEmailAddresses, 1);

        this.webhookService.sendEmailsChanged({
            spshPersonId,
            previousPrimaryEmail,
            previousAlternativeEmail,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
        });
    }
}
