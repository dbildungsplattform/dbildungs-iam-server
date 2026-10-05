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
        this.logger.info(`Received request to delete all email addresses for spshPerson ${params.spshPersonId}.`);
        const addresses: EmailAddress<true>[] = await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(
            params.spshPersonId,
        );

        if (addresses.length === 0) {
            this.logger.info(`No email addresses found for spshPerson ${params.spshPersonId}. Skipping deletion.`);
            return;
        }
        addresses.forEach((a: EmailAddress<true>) => {
            a.setStatus(EmailAddressStatusEnum.TO_BE_DELETED);
            a.markedForCron = new Date();
        });
        await Promise.all(addresses.map((a: EmailAddress<true>) => this.emailAddressRepo.save(a)));

        //If any of the external deletion operations fail, we keep the email addresses in DB with status TO_BE_DELETED for retry by the cronjob
        let canDbDeleteAllAdresses: boolean = true;

        const oxUserCounter: OXUserID | undefined = addresses.find(
            (a: EmailAddress<true>) => a.oxUserCounter,
        )?.oxUserCounter;
        const externalId: string | undefined = addresses.find((a: EmailAddress<true>) => a.externalId)?.externalId;
        const domain: string | undefined = addresses.find((a: EmailAddress<true>) => a.getDomain())?.getDomain();
        if (oxUserCounter) {
            //Deleting the Group Relations extra is not necessary as Ox deletes them automatically when deleting the user
            let deleteUserResult: Result<void, Error>;

            if (!this.oxAdapter.useOx()) {
                const oxUserAddresses: object = addresses.map((a: EmailAddress<true>) => ({
                    address: a.address,
                    priority: a.priority,
                    externalId: a.externalId,
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
                    `Successfully deleted for spshPerson ${params.spshPersonId} the corresponding Ox user ${oxUserCounter}.`,
                );
            } else if (deleteUserResult.error instanceof OxNoSuchUserError) {
                this.logger.info(
                    `User for spshPerson ${params.spshPersonId} with Ox user id ${oxUserCounter} does not exist in Ox anymore. Continuing deletion process.`,
                );
            } else {
                canDbDeleteAllAdresses = false;
            }
        } else {
            this.logger.warning(
                `No oxUserCounter found for spshPerson ${params.spshPersonId} when deleting email addresses. Skipping Ox deletion`,
            );
        }
        if (externalId && domain) {
            let deleteLdapPersonResult: Result<void, Error>;

            if (!this.ldapClientAdapter.useLdap()) {
                const ldapUserAddresses: object = addresses.map((a: EmailAddress<true>) => ({
                    address: a.address,
                    priority: a.priority,
                    externalId: a.externalId,
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

            if (!deleteLdapPersonResult.ok) {
                canDbDeleteAllAdresses = false;
            } else {
                this.logger.info(
                    `Successfully deleted for spshPerson ${params.spshPersonId} the LDAP user with uid: ${externalId} in domain ${domain}.`,
                );
            }
        } else {
            this.logger.warning(
                `No externalId or domain found for spshPerson ${params.spshPersonId} when deleting email addresses. Skipping LDAP deletion`,
            );
        }

        if (this.ldapUndiClientAdapter.useLdap()) {
            const ldapUndiDeleteResult: Result<void> = await this.ldapUndiClientAdapter.deletePerson(
                params.spshPersonId,
            );

            if (ldapUndiDeleteResult.ok) {
                this.logger.info(`Successfully deleted person ${params.spshPersonId} in UNDI LDAP`);
            } else {
                canDbDeleteAllAdresses = false;
                this.logger.logUnknownAsError(
                    `Could not delete person ${params.spshPersonId} in UNDI LDAP`,
                    ldapUndiDeleteResult.error,
                );
            }
        } else {
            this.logger.info(`LDAP UNDI disabled -> faking deletePerson. Data: spshPersonId=${params.spshPersonId}`);
        }

        if (canDbDeleteAllAdresses) {
            await Promise.all(addresses.map((a: EmailAddress<true>) => this.emailAddressRepo.delete(a)));
            this.logger.info(`Successfully deleted all email addresses for spshPerson ${params.spshPersonId} from DB.`);
        } else {
            this.logger.warning(
                `Could not delete all external representations for spshPerson ${params.spshPersonId}. Keeping email addresses in DB with status TO_BE_DELETED for retry.`,
            );
        }

        // Webhook notify
        const previousPrimaryEmail: string | undefined = addresses.find(
            (a: EmailAddress<true>) => a.priority === 0,
        )?.address;
        const previousAlternativeEmail: string | undefined = addresses.find(
            (a: EmailAddress<true>) => a.priority === 1,
        )?.address;

        this.webhookService.sendEmailsChanged({
            spshPersonId: params.spshPersonId,
            previousPrimaryEmail,
            previousAlternativeEmail,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
        });
    }
}
