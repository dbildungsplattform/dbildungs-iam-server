import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { DomainError } from '../../../../shared/error/index.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { LdapClientAdapter } from '../../ldap/adapter/domain/ldap-client.adapter.js';
import { OxAdapter } from '../../ox/adapter/domain/ox.adapter.js';
import { ChangeUserAction } from '../../ox/adapter/technical/actions/user/change-user.action.js';
import { OxSendService } from '../../ox/adapter/technical/ox-send.service.js';
import { ExternalIdMigrationDbFailedError } from '../error/external-id-migration-db-failed.error.js';
import { ExternalIdMigrationLdapFailedError } from '../error/external-id-migration-ldap-failed.error.js';
import { ExternalIdMigrationOxFailedError } from '../error/external-id-migration-ox-failed.error.js';
import { InconsistentExternalIdForPersonError } from '../error/inconsistent-external-id-for-person.error.js';
import { InconsistentOxUserCounterForPersonError } from '../error/inconsistent-ox-user-counter-for-person.error.js';
import { NoEmailAddressesForPersonError } from '../error/no-email-addresses-for-person.error.js';
import { EmailAddressRepo } from '../persistence/email-address.repo.js';
import { EmailAddress } from './email-address.js';

@Injectable()
export class MigrateExternalIdForSpshPersonService {
    public constructor(
        private readonly emailAddressRepo: EmailAddressRepo,
        private readonly oxAdapter: OxAdapter,
        private readonly oxSendService: OxSendService,
        private readonly ldapClientAdapter: LdapClientAdapter,
        private readonly logger: ClassLogger,
    ) {}

    // Migrates a person's externalId (used as OX username and LDAP uid) to their spshPersonId.
    public async migrateExternalId(params: { spshPersonId: string }): Promise<void> {
        const { spshPersonId }: { spshPersonId: string } = params;
        const result: Result<void, DomainError> = await this.migrateExternalIdInternal(spshPersonId);

        if (!result.ok) {
            throw result.error;
        }
    }

    private async migrateExternalIdInternal(spshPersonId: string): Promise<Result<void, DomainError>> {
        this.logger.info(`MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - Request received`);

        const addressesResult: Result<EmailAddress<true>[], DomainError> = await this.loadAddresses(spshPersonId);
        if (!addressesResult.ok) {
            return addressesResult;
        }

        const oldExternalId: string | undefined = this.findOldExternalId(addressesResult.value);
        const oxUserCounter: string | undefined = this.findOxUserCounter(addressesResult.value);
        const domain: string | undefined = this.findDomain(addressesResult.value);

        if (!this.needsMigration(oldExternalId, spshPersonId)) {
            return Ok(undefined);
        }

        const oxResult: Result<void, DomainError> = await this.migrateOx(spshPersonId, oxUserCounter);
        if (!oxResult.ok) {
            return oxResult;
        }

        const ldapResult: Result<void, DomainError> = await this.migrateLdap(
            spshPersonId,
            oldExternalId,
            domain,
            oxUserCounter,
        );
        if (!ldapResult.ok) {
            return ldapResult;
        }

        const dbResult: Result<void, DomainError> = await this.migrateDb(
            spshPersonId,
            oldExternalId,
            domain,
            oxUserCounter,
        );
        if (!dbResult.ok) {
            return dbResult;
        }

        this.logger.info(`MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - Success`);

        return Ok(undefined);
    }

    private async loadAddresses(spshPersonId: string): Promise<Result<EmailAddress<true>[], DomainError>> {
        const addresses: EmailAddress<true>[] =
            await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);

        if (addresses.length === 0) {
            this.logger.error(`MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - No email addresses found`);

            return Err(new NoEmailAddressesForPersonError(spshPersonId));
        }

        const distinctExternalIds: string[] = [
            ...new Set(addresses.map((a: EmailAddress<true>) => a.externalId).filter((id: string): boolean => !!id)),
        ];

        if (distinctExternalIds.length > 1) {
            this.logger.error(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - Addresses have inconsistent externalIds: ${distinctExternalIds.join(', ')}`,
            );

            return Err(new InconsistentExternalIdForPersonError(spshPersonId));
        }

        const distinctOxUserCounters: string[] = [
            ...new Set(
                addresses.map((a: EmailAddress<true>) => a.oxUserCounter).filter((id?: string): id is string => !!id),
            ),
        ];

        if (distinctOxUserCounters.length > 1) {
            this.logger.error(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - Addresses have inconsistent oxUserCounters: ${distinctOxUserCounters.join(', ')}`,
            );

            return Err(new InconsistentOxUserCounterForPersonError(spshPersonId));
        }

        return Ok(addresses);
    }

    private findOldExternalId(addresses: EmailAddress<true>[]): string | undefined {
        return addresses.find((a: EmailAddress<true>) => !!a.externalId)?.externalId;
    }

    private findOxUserCounter(addresses: EmailAddress<true>[]): string | undefined {
        return addresses.find((a: EmailAddress<true>) => !!a.oxUserCounter)?.oxUserCounter;
    }

    private findDomain(addresses: EmailAddress<true>[]): string | undefined {
        return addresses.find((a: EmailAddress<true>) => a.getDomain())?.getDomain();
    }

    private needsMigration(oldExternalId: string | undefined, spshPersonId: string): oldExternalId is string {
        if (!oldExternalId) {
            this.logger.warning(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - No externalId found on any address, nothing to migrate from`,
            );

            return false;
        }

        if (oldExternalId === spshPersonId) {
            this.logger.info(`MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - Already migrated, nothing to do`);

            return false;
        }

        return true;
    }

    private async migrateOx(
        spshPersonId: string,
        oxUserCounter: string | undefined,
    ): Promise<Result<void, DomainError>> {
        if (!oxUserCounter || !this.oxAdapter.useOx()) {
            this.logger.warning(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - No oxUserCounter found or OX disabled, skipping OX`,
            );

            return Ok(undefined);
        }

        const oxResult: Result<void, DomainError> = await this.changeOxUsername(oxUserCounter, spshPersonId);

        if (!oxResult.ok) {
            this.logger.logUnknownAsError(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - OX update failed, aborting`,
                oxResult.error,
            );

            return Err(new ExternalIdMigrationOxFailedError(spshPersonId));
        }

        return Ok(undefined);
    }

    private async migrateLdap(
        spshPersonId: string,
        oldExternalId: string,
        domain: string | undefined,
        oxUserCounter: string | undefined,
    ): Promise<Result<void, DomainError>> {
        if (!domain || !this.ldapClientAdapter.useLdap()) {
            this.logger.warning(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - No domain found or LDAP disabled, skipping LDAP`,
            );

            return Ok(undefined);
        }

        const ldapResult: Result<void> = await this.ldapClientAdapter.renamePerson(oldExternalId, spshPersonId, domain);

        if (!ldapResult.ok) {
            this.logger.logUnknownAsError(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - LDAP update failed, reverting OX`,
                ldapResult.error,
            );

            const rollbackResult: Result<void, DomainError> = oxUserCounter
                ? await this.changeOxUsername(oxUserCounter, oldExternalId)
                : Ok(undefined);

            return Err(new ExternalIdMigrationLdapFailedError(spshPersonId, !rollbackResult.ok));
        }

        return Ok(undefined);
    }

    private async migrateDb(
        spshPersonId: string,
        oldExternalId: string,
        domain: string | undefined,
        oxUserCounter: string | undefined,
    ): Promise<Result<void, DomainError>> {
        try {
            await this.emailAddressRepo.updateExternalIdForSpshPerson(spshPersonId, spshPersonId);

            return Ok(undefined);
        } catch (err) {
            this.logger.logUnknownAsError(
                `MIGRATE EXTERNAL ID FOR SPSHPERSONID: ${spshPersonId} - DB update failed, reverting LDAP and OX`,
                err,
            );

            const ldapRollbackResult: Result<void> =
                domain && this.ldapClientAdapter.useLdap()
                    ? await this.ldapClientAdapter.renamePerson(spshPersonId, oldExternalId, domain)
                    : Ok(undefined);
            const oxRollbackResult: Result<void, DomainError> = oxUserCounter
                ? await this.changeOxUsername(oxUserCounter, oldExternalId)
                : Ok(undefined);

            return Err(
                new ExternalIdMigrationDbFailedError(spshPersonId, !ldapRollbackResult.ok || !oxRollbackResult.ok),
            );
        }
    }

    private async changeOxUsername(oxUserCounter: string, username: string): Promise<Result<void, DomainError>> {
        const action: ChangeUserAction = this.oxAdapter.createChangeUserAction(oxUserCounter, username);

        return this.oxSendService.send(action);
    }
}
