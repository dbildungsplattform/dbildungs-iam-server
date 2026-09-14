import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { EmailAppConfig } from '../../../../shared/config/email-app.config.js';
import { OxAdapter } from '../../ox/adapter/domain/ox.adapter.js';
import { WebhookService } from '../../webhook/domain/webhook.service.js';
import { EmailAddressStatusEnum } from '../persistence/email-address-status.entity.js';
import { EmailAddressRepo } from '../persistence/email-address.repo.js';
import { EmailAddress } from './email-address.js';

@Injectable()
export class SetEmailSuspendedService {
    private NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS: number;
    private ONE_DAY_MS: number = 86_400_000;

    public constructor(
        private readonly emailAddressRepo: EmailAddressRepo,
        private readonly oxAdapter: OxAdapter,
        private readonly logger: ClassLogger,
        private readonly webhookService: WebhookService,
        config: EmailAppConfig,
    ) {
        this.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS =
            config.EMAIL.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS ?? 90;
    }

    public async setEmailsSuspended(params: { spshPersonId: string }): Promise<void> {
        this.logger.info(`Received request to set email addresses to suspended for spshPerson ${params.spshPersonId}.`);
        const addresses: EmailAddress<true>[] = await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(
            params.spshPersonId,
        );

        if (addresses.length === 0) {
            this.logger.info(
                `No email addresses found for spshPerson ${params.spshPersonId}. Skipping setting suspended.`,
            );
            return;
        }

        const eligibleAddresses: EmailAddress<true>[] = addresses.filter((a: EmailAddress<true>) => {
            if (a.priority > 1) {
                this.logger.info(`Priority of email address ${a.address} is not 0 or 1. Skipping setting suspended`);
                return false;
            }
            return true;
        });

        eligibleAddresses.forEach((a: EmailAddress<true>) => {
            a.setStatus(EmailAddressStatusEnum.SUSPENDED);
            a.markedForCron ??= new Date(
                Date.now() + this.ONE_DAY_MS * this.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS,
            );
        });
        await Promise.all(eligibleAddresses.map((a: EmailAddress<true>) => this.emailAddressRepo.save(a)));

        if (this.oxAdapter.useOx()) {
            // Remove user from OX groups if we have an OX id
            const oxUserCounter: string | undefined = eligibleAddresses.find(
                (a: EmailAddress<true>) => a.oxUserCounter,
            )?.oxUserCounter;

            if (oxUserCounter) {
                this.logger.info(`Removing user ${params.spshPersonId} from all OX groups.`);
                const result: Result<void> = await this.oxAdapter.setUserOxGroups(oxUserCounter, []);

                if (!result.ok) {
                    this.logger.logUnknownAsError('Error while removing user from OX groups.', result.error);
                }
            }
        } else {
            this.logger.info(
                `Ox is disabled -> skip removing OX groups from user - spshPersonId=${params.spshPersonId}`,
            );
        }

        // Webhook update
        const previousPrimaryEmail: string | undefined = eligibleAddresses.find(
            (a: EmailAddress<true>) => a.priority === 0,
        )?.address;
        const previousAlternativeEmail: string | undefined = eligibleAddresses.find(
            (a: EmailAddress<true>) => a.priority === 1,
        )?.address;

        this.webhookService.sendEmailsChanged({
            spshPersonId: params.spshPersonId,
            newPrimaryEmail: undefined,
            newAlternativeEmail: undefined,
            previousPrimaryEmail,
            previousAlternativeEmail,
        });
    }
}
