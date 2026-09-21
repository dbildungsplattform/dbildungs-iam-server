import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { DomainError } from '../../../../shared/error/domain.error.js';
import { PersonID, PersonUsername } from '../../../../shared/types/index.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { LdapClientAdapter, PersonData } from '../../ldap/adapter/domain/ldap-client.adapter.js';
import { CreateUserAction, CreateUserResponse } from '../../ox/adapter/technical/actions/user/create-user.action.js';
import { GetDataForUserResponse } from '../../ox/adapter/technical/actions/user/get-data-user.action.js';
import { OxSendService } from '../../ox/adapter/technical/ox-send.service.js';
import { OxAdapter } from '../../ox/adapter/domain/ox.adapter.js';
import { OxPrimaryMailAlreadyExistsError } from '../../ox/adapter/domain/error/ox-primary-mail-already-exists.error.js';
import { EmailDomainNotFoundError } from '../error/email-domain-not-found.error.js';
import { EmailAddressStatusEnum } from '../persistence/email-address-status.entity.js';
import { EmailAddressRepo } from '../persistence/email-address.repo.js';
import { EmailDomainRepo } from '../persistence/email-domain.repo.js';
import { EmailAddressGenerator } from './email-address-generator.js';
import { EmailAddress } from './email-address.js';
import { EmailDomain } from './email-domain.js';
import { EmailUpdateInProgressError } from '../error/email-update-in-progress.error.js';
import { EmailAddressGenerationAttemptsExceededError } from '../error/email-address-generation-attempts-exceeds.error.js';
import { uniqBy } from 'lodash-es';
import { OxError } from '../../../../shared/error/ox.error.js';
import { EmailAppConfig } from '../../../../shared/config/email-app.config.js';
import { WebhookService } from '../../webhook/domain/webhook.service.js';

const MAX_EMAIL_PRIORITY: number = 99999; // E-Mails will be created with this priority before being activated

type SchoolwithKennungAndName = {
    id: string;
    kennung: string;
    name: string;
};

@Injectable()
export class SetEmailAddressForSpshPersonService {
    public RETRY_ATTEMPTS: number = 5;

    private NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS: number;

    public constructor(
        private readonly emailAddressRepo: EmailAddressRepo,
        private readonly emailDomainRepo: EmailDomainRepo,
        private readonly logger: ClassLogger,
        private readonly emailAddressGenerator: EmailAddressGenerator,
        private readonly oxAdapter: OxAdapter,
        private readonly oxSendService: OxSendService,
        private readonly ldapClientAdapter: LdapClientAdapter,
        private readonly webhookService: WebhookService,
        config: EmailAppConfig,
    ) {
        this.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS =
            config.EMAIL.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS ?? 90;
    }

    /**
     * Makes sure the given user *will* have an e-mail matching their details.
     *
     * Will instantly abort, if the user currently has an address in a PENDING state
     *
     * 1. If the users first- and lastname no longer match their address (or if they don't have an address) they should get a matching address
     *    - If the user has an old address that would match their name, that one should be reactivated
     *    - Otherwise a new address will be generated
     * 2. Other addresses should remain at their relative priorities (but may be shifted back to make room for the new/reactivated address)
     *    - Exception: If the current priority 0 address is not active (i.e. there was an error) it will be set to priority 2 first (so the alternative mail will be correct)
     * 3. The user should be created/update in OX
     *    - If our data suggests an OX account should already exist, it will be updated (if it doesn't actually exist, this is considered an error)
     *    - Otherwise a new user will be created and the returned ID from OX will be persisted
     * 4. The users groups in OX should be updated
     * 5. The user should be created/updated in LDAP
     *    - If the user exists, it will be updated
     *    - Otherwise a new user will be created
     *
     * The whole process will be retried 5 times on errors
     */
    public async setEmailAddressForSpshPerson(params: {
        spshPersonId: string;
        spshUsername: string;
        organisations: SchoolwithKennungAndName[];
        firstName: string;
        lastName: string;
        gesperrt: boolean;
        spshServiceProviderId: string;
    }): Promise<void> {
        this.logger.info(`SET EMAIL FOR SPSHPERSONID: ${params.spshPersonId} - Request Received`);

        const emailDomain: Option<EmailDomain<true>> = await this.emailDomainRepo.findBySpshServiceProviderId(
            params.spshServiceProviderId,
        );

        if (!emailDomain) {
            this.logger.error(
                `SET EMAIL FOR SPSHPERSONID: ${params.spshPersonId} - EmailDomain with spshServiceProviderId ${params.spshServiceProviderId} not found`,
            );
            throw new EmailDomainNotFoundError(
                `EmailDomain with spshServiceProviderId ${params.spshServiceProviderId} not found`,
            );
        }

        if (await this.checkForPendingEmail(params.spshPersonId)) {
            this.logger.error(
                `SET EMAIL FOR SPSHPERSONID: ${params.spshPersonId} - Some e-mail already requested, aborting.`,
            );
            throw new EmailUpdateInProgressError('e-mail generation already in progress');
        }

        const uniqueOrganisations: SchoolwithKennungAndName[] = uniqBy(
            params.organisations,
            (o: SchoolwithKennungAndName) => o.id,
        );

        const result: Result<void> = await this.createOrUpdateEmailWithRetries(
            this.RETRY_ATTEMPTS,
            params.firstName,
            params.lastName,
            params.spshPersonId,
            params.spshUsername,
            uniqueOrganisations,
            emailDomain,
        );

        if (!result.ok) {
            throw result.error;
        }
    }

    private async createOrUpdateEmailWithRetries(
        attempts: number,
        firstName: string,
        lastName: string,
        spshPersonId: string,
        spshUsername: string,
        organisations: SchoolwithKennungAndName[],
        emailDomain: EmailDomain<true>,
    ): Promise<Result<void>> {
        for (let i: number = 0; i < attempts; i++) {
            this.logger.info(`SET EMAIL FOR SPSHPERSONID: ${spshPersonId} - Attempt ${i + 1}`);

            try {
                // eslint-disable-next-line no-await-in-loop
                const result: Result<void> = await this.createOrUpdateEmail(
                    firstName,
                    lastName,
                    spshPersonId,
                    spshUsername,
                    organisations,
                    emailDomain,
                );

                if (result.ok) {
                    // Success, abort the retry loop
                    this.logger.info(`SET EMAIL FOR SPSHPERSONID: ${spshPersonId} - Success`);
                    return Ok(undefined);
                }

                this.logger.logUnknownAsError(
                    `SET EMAIL FOR SPSHPERSONID: ${spshPersonId} - Error while creating or updating the email`,
                    result.error,
                );
            } catch (err) {
                this.logger.logUnknownAsError(`SET EMAIL FOR SPSHPERSONID: ${spshPersonId} - Unknown error`, err);
            }
        }

        this.logger.error(`SET EMAIL FOR SPSHPERSONID: ${spshPersonId} - All attempts failed, aborting`);
        return Err(new EmailAddressGenerationAttemptsExceededError());
    }

    /**
     * Checks if the person has a e-mail that is currently in a pending state
     * @param spshPersonId
     */
    private async checkForPendingEmail(spshPersonId: PersonID): Promise<boolean> {
        const addressesWithStatuses: EmailAddress<true>[] =
            await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);

        return !!addressesWithStatuses.find(
            (aws: EmailAddress<true>) => aws.getStatus() === EmailAddressStatusEnum.PENDING,
        );
    }

    /**
     * Tries to (re)activate an existing mail or generate a new one, if the existing ones no longer match the name
     * Also updates OX and LDAP entries
     */
    private async createOrUpdateEmail(
        firstName: string,
        lastName: string,
        spshPersonId: string,
        spshUsername: string,
        organisations: SchoolwithKennungAndName[],
        emailDomain: EmailDomain<true>,
    ): Promise<Result<void>> {
        const newPrimaryEmailResult: Result<EmailAddress<true>> = await this.getOrCreateAvailableEmail({
            emailDomain: emailDomain,
            firstName,
            lastName,
            spshPersonId,
        });

        if (!newPrimaryEmailResult.ok) {
            this.logger.logUnknownAsError(`Could not determine available e-mail`, newPrimaryEmailResult.error);

            return newPrimaryEmailResult;
        }

        let newPrimaryEmail: EmailAddress<true> = newPrimaryEmailResult.value;

        const externalId: string = newPrimaryEmail.externalId; // Used as ox username and ldap uid.

        let previousPrimaryEmail: string | undefined;
        let previousAlternativeEmail: string | undefined;
        {
            const allEmailsWithStatuses: EmailAddress<true>[] =
                await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);

            const currentPrioZero: EmailAddress<true> | undefined = allEmailsWithStatuses.find(
                (em: EmailAddress<true>) => em.priority === 0,
            );

            const currentPrioOne: EmailAddress<true> | undefined = allEmailsWithStatuses.find(
                (em: EmailAddress<true>) => em.priority === 1,
            );

            previousPrimaryEmail = currentPrioZero?.address;
            previousAlternativeEmail = currentPrioOne?.address;

            // Shift email back if necessary
            if (currentPrioZero?.id !== newPrimaryEmail.id) {
                if (currentPrioZero && currentPrioZero.getStatus() !== EmailAddressStatusEnum.ACTIVE) {
                    const shiftResult: Result<unknown, Error> = await this.emailAddressRepo.shiftPriorities(
                        currentPrioZero,
                        2,
                    );

                    if (!shiftResult.ok) {
                        this.logger.logUnknownAsError(
                            `Error while updating e-mail priorities for prio 0 mail`,
                            shiftResult.error,
                        );

                        newPrimaryEmail.setStatus(EmailAddressStatusEnum.FAILED);
                        newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);

                        return shiftResult;
                    }
                }
            }
        }

        let alternativeEmail: EmailAddress<true> | undefined;

        // Don't set pending status, if the email is already prio 0
        if (newPrimaryEmail.priority > 0) {
            newPrimaryEmail.setStatus(EmailAddressStatusEnum.PENDING);
            newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);

            const updatedEmailsResult: Result<EmailAddress<true>[], Error> =
                await this.emailAddressRepo.shiftPriorities(newPrimaryEmail, 0);

            if (!updatedEmailsResult.ok) {
                this.logger.logUnknownAsError(`Error while updating e-mail priorities`, updatedEmailsResult.error);

                newPrimaryEmail.setStatus(EmailAddressStatusEnum.FAILED);
                newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);

                return updatedEmailsResult;
            }

            const cronDate: Date = new Date();
            cronDate.setDate(cronDate.getDate() + this.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS);
            const emailsAfter: EmailAddress<true>[] = await this.emailAddressRepo.ensureStatusesAndCronDateForPerson(
                spshPersonId,
                cronDate,
            );

            // Replace the primary email with the saved one (to make sure everything is up to date)
            newPrimaryEmail = emailsAfter.find((em: EmailAddress<true>) => em.priority === 0)!;

            // Find the email which is not at priority 1 to use as an alternative mail
            alternativeEmail = emailsAfter.find((em: EmailAddress<true>) => em.priority === 1);
        } else {
            const mails: EmailAddress<true>[] =
                await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);
            alternativeEmail = mails.find((em: EmailAddress<true>) => em.priority === 1);
        }

        const kennungen: string[] = organisations.map((o: SchoolwithKennungAndName) => o.kennung);

        // Update or create ox user
        const oxUserIdResult: Result<string> = await this.upsertOxUser(
            spshUsername,
            firstName,
            lastName,
            newPrimaryEmail,
            alternativeEmail,
            kennungen,
        );

        if (!oxUserIdResult.ok) {
            this.logger.logUnknownAsError(`Error while updating ox user`, oxUserIdResult.error);

            if (oxUserIdResult.error instanceof OxPrimaryMailAlreadyExistsError) {
                newPrimaryEmail.setStatus(EmailAddressStatusEnum.EXISTS_ONLY_IN_OX);
                newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);
            } else {
                newPrimaryEmail.setStatus(EmailAddressStatusEnum.FAILED);
                newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);
            }

            return oxUserIdResult;
        }

        // Update e-mail with the ox user ID and priority
        {
            newPrimaryEmail.oxUserCounter = oxUserIdResult.value;
            newPrimaryEmail.markedForCron = undefined;

            const saveResult: Result<unknown, DomainError> = await this.emailAddressRepo.save(newPrimaryEmail);

            if (!saveResult.ok) {
                this.logger.logUnknownAsError(`Error while updating e-mail`, saveResult.error);

                // Persist the e-mail as failed
                newPrimaryEmail.setStatus(EmailAddressStatusEnum.FAILED);
                newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);

                return saveResult;
            }
        }

        // update or create LDAP user
        const ldapResult: Result<void> = await this.upsertLdapUser(
            externalId,
            spshUsername,
            firstName,
            lastName,
            newPrimaryEmail.address,
            alternativeEmail?.address,
            emailDomain.domain,
        );

        if (!ldapResult.ok) {
            this.logger.logUnknownAsError(`Error while updating/creating LDAP user`, ldapResult.error);

            // Persist the e-mail as failed
            newPrimaryEmail.setStatus(EmailAddressStatusEnum.FAILED);
            newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);

            return ldapResult;
        }

        // Everything was a success, set the e-mail to active
        newPrimaryEmail.setStatus(EmailAddressStatusEnum.ACTIVE);
        newPrimaryEmail = await this.updateEmailIgnoreMissing(newPrimaryEmail);
        if (alternativeEmail) {
            alternativeEmail.setStatus(EmailAddressStatusEnum.ACTIVE);
            alternativeEmail = await this.updateEmailIgnoreMissing(alternativeEmail);
        }

        // Send webhook update
        this.webhookService.sendEmailsChanged({
            spshPersonId,
            newPrimaryEmail: newPrimaryEmail.address,
            newAlternativeEmail: alternativeEmail?.address,
            previousPrimaryEmail,
            previousAlternativeEmail,
        });

        return Ok(undefined);
    }

    /**
     * Tries to match an existing email, if none can be found a new email will be generated and persisted (with priority = MAX_INT)
     */
    private async getOrCreateAvailableEmail(params: {
        spshPersonId: PersonID;
        firstName: string;
        lastName: string;
        emailDomain: EmailDomain<true>;
    }): Promise<Result<EmailAddress<true>>> {
        // Try to match an existing email first
        const existingAddresses: EmailAddress<true>[] =
            await this.emailAddressRepo.findBySpshPersonIdSortedByPriorityAsc(params.spshPersonId);

        const matchingEmail: Option<EmailAddress<true>> = existingAddresses.find(
            (em: EmailAddress<true>) =>
                // Exclude EXISTS_ONLY_IN_OX emails
                em.getStatus() !== EmailAddressStatusEnum.EXISTS_ONLY_IN_OX &&
                this.emailAddressGenerator.isEqualIgnoreCount(
                    em.address,
                    params.firstName,
                    params.lastName,
                    params.emailDomain.domain,
                ),
        );

        if (matchingEmail) {
            return Ok(matchingEmail);
        }

        // Use externalId from existing E-Mails if possible, otherwise use spsh person ID
        const externalId: string =
            existingAddresses.find((em: EmailAddress<true>) => !!em.externalId)?.externalId ?? params.spshPersonId;

        // Find an existing ox user ID
        const oxUserCounter: string | undefined = existingAddresses.find(
            (em: EmailAddress<true>) => !!em.oxUserCounter,
        )?.oxUserCounter;

        // Generate a new email
        const generationResult: Result<string, Error> = await this.emailAddressGenerator.generateAvailableAddress(
            params.firstName,
            params.lastName,
            params.emailDomain.domain,
        );

        if (!generationResult.ok) {
            this.logger.error(
                `GENERATE EMAIL ADDRESS FOR SPSH PERSON: ${params.spshPersonId} - Failed: ${generationResult.error.message}`,
            );
            return generationResult;
        }

        const emailAddressToCreate: EmailAddress<false> = EmailAddress.createNew({
            address: generationResult.value,
            priority: MAX_EMAIL_PRIORITY, // Needs to be shifted into position
            spshPersonId: params.spshPersonId,
            externalId,
            oxUserCounter,
            markedForCron: undefined,
        });

        return await this.emailAddressRepo.save(emailAddressToCreate);
    }

    /**
     * Will create or update an user in OX, depending on wether the given address has an oxUserCounter.
     *
     * If the oxUserCounter is given, the user will be updated (if it can't be found in OX, an error will be returned).
     * Otherwise a new user will be created.
     *
     * In both cases, the users groups will be updated.
     *
     * @returns the oxUserCounter of the user (if the user was newly created, this will be the generated value)
     */
    private async upsertOxUser(
        spshUsername: PersonUsername,
        firstname: string,
        lastname: string,
        primaryEmail: EmailAddress<true>,
        alternativeEmail: EmailAddress<true> | undefined,
        kennungen: string[],
    ): Promise<Result<string>> {
        if (!this.oxAdapter.useOx()) {
            this.logger.info(
                `Ox is disabled -> faking upsertOxUser - spshUsername=${spshUsername}, firstname=${firstname}, lastname=${lastname}, ` +
                    `primaryEmail=${primaryEmail.address}, alternativeEmail=${alternativeEmail?.address ?? 'none'}, ` +
                    `externalId=${primaryEmail.externalId}, spshPersonId=${primaryEmail.spshPersonId}, kennungen=${JSON.stringify(
                        kennungen,
                    )}`,
            );

            return Ok(primaryEmail.oxUserCounter ?? `Fake-OX-${primaryEmail.spshPersonId}`);
        }

        const externalId: string = primaryEmail.externalId;
        const oxUserCounter: string | undefined = primaryEmail.oxUserCounter;

        if (oxUserCounter) {
            // Check if OX User exists -> otherwise error

            const exists: Result<GetDataForUserResponse, DomainError> = await this.oxSendService.send(
                this.oxAdapter.createGetDataForUserAction(oxUserCounter),
            );

            if (!exists.ok) {
                this.logger.logUnknownAsError(`Could not find user in ox`, exists.error);
                return exists;
            }

            if (!exists.value) {
                this.logger.error(`Could not find user in ox`);
                return Err(new OxError('User not found'));
            }

            // update OX user

            const aliases: string[] = [primaryEmail.address, alternativeEmail?.address].filter(Boolean);

            const changeResult: Result<void, DomainError> = await this.oxSendService.send(
                this.oxAdapter.createChangeUserAction(
                    oxUserCounter,
                    externalId,
                    aliases,
                    firstname,
                    lastname,
                    spshUsername,
                    primaryEmail.address,
                    primaryEmail.address,
                ),
            );

            if (!changeResult.ok) {
                this.logger.logUnknownAsError(`Could not create update in ox`, changeResult.error);
                return changeResult;
            }

            await this.oxAdapter.setUserOxGroups(oxUserCounter, kennungen);

            return Ok(oxUserCounter);
        } else {
            // create ox user (returning ID!)
            const createAction: CreateUserAction = this.oxAdapter.createCreateUserAction({
                username: externalId,
                displayName: spshUsername,
                firstname,
                lastname,
                primaryEmail: primaryEmail.address,
            });

            const createResult: Result<CreateUserResponse, DomainError> = await this.oxSendService.send(createAction);

            if (!createResult.ok) {
                this.logger.logUnknownAsError(`Could not create user in ox`, createResult.error);
                return createResult;
            }

            await this.oxAdapter.setUserOxGroups(createResult.value.id, kennungen);

            return Ok(createResult.value.id);
        }
    }

    /**
     * Will create or update the user in LDAP, depending on wether it already exists.
     */
    private async upsertLdapUser(
        uid: string,
        username: string,
        firstName: string,
        lastName: string,

        primaryEmail: string,
        alternativeEmail: string | undefined,

        domain: string,
    ): Promise<Result<void>> {
        if (!this.ldapClientAdapter.useLdap()) {
            this.logger.info(
                `LDAP is disabled -> faking upsertLdapUser - uid=${uid}, username=${username}, firstName=${firstName}, lastName=${lastName}, primaryEmail=${primaryEmail}, alternativeEmail=${alternativeEmail ?? 'none'}, domain=${domain}`,
            );

            return Ok(undefined);
        }

        const exists: Result<boolean> = await this.ldapClientAdapter.isPersonExisting(uid, domain);

        if (!exists.ok) {
            return exists;
        }

        if (exists.value) {
            // Update
            const updateResult: Result<PersonData> = await this.ldapClientAdapter.updatePerson(
                {
                    uid,
                    username,
                    firstName,
                    lastName,
                },
                domain,
                primaryEmail,
                alternativeEmail,
            );

            if (!updateResult.ok) {
                return updateResult;
            }
        } else {
            // Create
            const createResult: Result<PersonData> = await this.ldapClientAdapter.createPerson(
                {
                    uid,
                    username,
                    firstName,
                    lastName,
                },
                domain,
                primaryEmail,
                alternativeEmail,
            );

            if (!createResult.ok) {
                return createResult;
            }
        }

        return Ok(undefined);
    }

    private async updateEmailIgnoreMissing(emailAddress: EmailAddress<true>): Promise<EmailAddress<true>> {
        const result: Result<EmailAddress<true>, DomainError> = await this.emailAddressRepo.save(emailAddress);

        if (result.ok) {
            return result.value;
        }

        this.logger.logUnknownAsError(`Saving of E-Mail-Address ${emailAddress.address} failed`, result.error);

        return emailAddress;
    }
}
