import { Module } from '@nestjs/common';
import { LoggerModule } from '../../../core/logging/logger.module.js';
import { EmailLdapModule } from '../ldap/email-ldap.module.js';
import { EmailOxModule } from '../ox/email-ox.module.js';
import { EmailWebhookModule } from '../webhook/webhook.module.js';
import { EmailCronController } from './api/controller/email-cron.controller.js';
import { EmailReadController } from './api/controller/email-read.controller.js';
import { EmailWriteController } from './api/controller/email-write.controller.js';
import { CronDeleteEmailsAddressesService } from './domain/cron-delete-email-addresses.service.js';
import { DeleteEmailsAddressesForSpshPersonService } from './domain/delete-email-adresses-for-spsh-person.service.js';
import { EmailAddressGenerator } from './domain/email-address-generator.js';
import { MigrateExternalIdForSpshPersonService } from './domain/migrate-external-id-for-spsh-person.service.js';
import { SetEmailAddressForSpshPersonService } from './domain/set-email-address-for-spsh-person.service.js';
import { SetEmailSuspendedService } from './domain/set-email-suspended.service.js';
import { EmailAddressRepo } from './persistence/email-address.repo.js';
import { EmailDomainRepo } from './persistence/email-domain.repo.js';

@Module({
    imports: [LoggerModule.register(EmailCoreModule.name), EmailOxModule, EmailLdapModule, EmailWebhookModule],
    providers: [
        SetEmailAddressForSpshPersonService,
        DeleteEmailsAddressesForSpshPersonService,
        SetEmailSuspendedService,
        MigrateExternalIdForSpshPersonService,
        EmailAddressRepo,
        EmailDomainRepo,
        EmailAddressGenerator,
        CronDeleteEmailsAddressesService,
    ],
    exports: [EmailAddressRepo, EmailDomainRepo],
    controllers: [EmailReadController, EmailWriteController, EmailCronController],
})
export class EmailCoreModule {}
