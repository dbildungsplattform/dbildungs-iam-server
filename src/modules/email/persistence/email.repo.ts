import { EntityManager, Loaded, QueryOrder, ref } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { EmailAddressID, PersonID } from '../../../shared/types/index.js';
import { EmailAddressEntity } from './email-address.entity.js';
import { EmailAddress, EmailAddressStatus } from '../domain/email-address.js';
import { EmailAddressNotFoundError } from '../error/email-address-not-found.error.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError } from '../../../shared/error/index.js';
import { PersonEntity } from '../../person/persistence/person.entity.js';
import { PersonAlreadyHasEnabledEmailAddressError } from '../error/person-already-has-enabled-email-address.error.js';
import { Person } from '../../person/domain/person.js';
import { PersonEmailResponse } from '../../person/api/person-email-response.js';
import { EmailAddressDeletionError } from '../error/email-address-deletion.error.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { EmailAddressDeletedInDatabaseEvent } from '../../../shared/events/email/email-address-deleted-in-database.event.js';
import { EmailAddressMissingOxUserIdError } from '../error/email-address-missing-ox-user-id.error.js';
import { EmailInstanceConfig } from '../email-instance-config.js';
import assert from 'assert';
import { KafkaEmailAddressDeletedInDatabaseEvent } from '../../../shared/events/email/kafka-email-address-deleted-in-database.event.js';
import { SortOrder } from '../../../shared/persistence/repository.enums.js';

const NON_ENABLED_EMAIL_ADDRESS_DEADLINE_IN_DAYS_DEFAULT: number = 180;

export function compareEmailAddressesByUpdatedAt(
    ea1: EmailAddressEntity,
    ea2: EmailAddressEntity,
    order: SortOrder,
): number {
    if (!ea1.updatedAt && order === SortOrder.ASC) {
        return Number.MAX_VALUE;
    }
    if (!ea1.updatedAt && order === SortOrder.DESC) {
        return Number.MIN_VALUE;
    }
    if (!ea2.updatedAt && order === SortOrder.ASC) {
        return Number.MIN_VALUE;
    }
    if (!ea2.updatedAt && order === SortOrder.DESC) {
        return Number.MAX_VALUE;
    }
    if (order === SortOrder.ASC) {
        return ea1.updatedAt.getTime() - ea2.updatedAt.getTime();
    }
    return ea2.updatedAt.getTime() - ea1.updatedAt.getTime();
}

export function compareEmailAddressesByUpdatedAtDesc(ea1: EmailAddressEntity, ea2: EmailAddressEntity): number {
    return compareEmailAddressesByUpdatedAt(ea1, ea2, SortOrder.DESC);
}

// Disable explicit types here because it's virtually impossible to do this correctly
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mapAggregateToData(emailAddress: EmailAddress<boolean>) {
    const oxUserIdStr: string | undefined = emailAddress.oxUserID ? emailAddress.oxUserID + '' : undefined;
    return {
        // Don't assign createdAt and updatedAt, they are auto-generated!
        id: emailAddress.id,
        personId: ref(PersonEntity, emailAddress.personId),
        address: emailAddress.address,
        oxUserId: oxUserIdStr,
        status: emailAddress.status,
    };
}

function mapEntityToAggregate(entity: EmailAddressEntity): EmailAddress<boolean> {
    return new EmailAddress(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.personId?.id,
        entity.address,
        entity.status,
        entity.oxUserId,
    );
}

@Injectable()
export class EmailRepo {
    public constructor(
        private readonly em: EntityManager,
        private readonly eventService: EventRoutingLegacyKafkaService,
        private readonly emailInstanceConfig: EmailInstanceConfig,
        private readonly logger: ClassLogger,
    ) {}

    public async findEnabledByPerson(personId: PersonID): Promise<Option<EmailAddress<true>>> {
        const emailAddressEntity: Option<EmailAddressEntity> = await this.em.findOne(
            EmailAddressEntity,
            {
                personId: { $eq: personId },
                status: { $eq: EmailAddressStatus.ENABLED },
            },
            {},
        );
        if (!emailAddressEntity) {
            return undefined;
        }

        return mapEntityToAggregate(emailAddressEntity);
    }

    /**
     * Will return the most recently updated EmailAddress if multiple EmailAddresses with REQUESTED status can be found for personId, warning will be logged in this case.
     * @param personId
     */
    public async findRequestedByPerson(personId: PersonID): Promise<Option<EmailAddress<true>>> {
        const emailAddresses: EmailAddress<true>[] = await this.findByPersonSortedByUpdatedAtDesc(
            personId,
            EmailAddressStatus.REQUESTED,
        );

        if (!emailAddresses || !emailAddresses[0]) {
            return null;
        }

        if (emailAddresses.length > 1) {
            this.logger.warning(
                `Multiple EmailAddresses Found In REQUESTED Status For personId:${personId}, Will Only Return address:${emailAddresses[0].address}`,
            );
        }

        return emailAddresses[0];
    }

    /**
     * Filtering result-set by status is done after execution of DB-query,
     * therefore if status is not defined, no filtering is applied.
     * @param personId
     * @param status
     */
    public async findByPersonSortedByUpdatedAtDesc(
        personId: PersonID,
        status?: EmailAddressStatus,
    ): Promise<EmailAddress<true>[]> {
        const emailAddressEntities: EmailAddressEntity[] = await this.em.find(
            EmailAddressEntity,
            {
                personId: { $eq: personId },
            },
            { orderBy: { updatedAt: QueryOrder.DESC } },
        );

        let emails: EmailAddress<true>[] = emailAddressEntities.map(mapEntityToAggregate);

        if (status) {
            emails = emails.filter((ea: EmailAddress<true>) => ea.status === status);
        }

        return emails;
    }

    /**
     * Returns all ENABLED EmailAddresses for a list of personIds.
     * The result is ordered by personId ascending and updatedAt descending.
     * @param personIds
     */
    public async findEnabledByPersonIdsSortedByUpdatedAtDesc(personIds: PersonID[]): Promise<EmailAddress<true>[]> {
        const emailAddressEntities: EmailAddressEntity[] = await this.em.find(
            EmailAddressEntity,
            {
                $and: [{ status: EmailAddressStatus.ENABLED }, { personId: { $in: personIds } }],
            },
            { orderBy: [{ personId: QueryOrder.ASC }, { updatedAt: QueryOrder.ASC }] },
        );

        return emailAddressEntities.map((entity: EmailAddressEntity) => mapEntityToAggregate(entity));
    }

    public async findByAddress(address: string): Promise<Option<EmailAddress<true>>> {
        const emailAddressEntity: Option<EmailAddressEntity> = await this.em.findOne(
            EmailAddressEntity,
            {
                address: { $eq: address },
            },
            { orderBy: { updatedAt: QueryOrder.DESC } },
        );

        if (!emailAddressEntity) {
            return undefined;
        }

        return mapEntityToAggregate(emailAddressEntity);
    }

    /**
     * Returns all EmailAddresses with status DELETED_LDAP, DELETED_OX and DELETE or
     * which have an updatedAt that exceeds the deadline (180 days) and are not ENABLED.
     * The result is ordered by updatedAt descending.
     *
     * @param limit Maximum number of email addresses to return
     */
    public async getByDeletedStatusOrUpdatedAtExceedsDeadline(limit: number): Promise<Counted<EmailAddress<true>>> {
        const daysAgo: Date = new Date();
        const deadlineInDays: number = this.getDeadlineInDaysForNonEnabledEmailAddresses();
        this.logger.info(`Fetching EmailAddresses For Deletion, deadlineInDays:${deadlineInDays}`);
        daysAgo.setDate(daysAgo.getDate() - deadlineInDays);

        const [emailAddressEntities, count]: [EmailAddressEntity[], number] = await this.em.findAndCount(
            EmailAddressEntity,
            {
                $or: [
                    { status: EmailAddressStatus.DELETED_LDAP },
                    { status: EmailAddressStatus.DELETED_OX },
                    { status: EmailAddressStatus.DELETED },
                    {
                        $and: [{ status: { $ne: EmailAddressStatus.ENABLED } }, { updatedAt: { $lt: daysAgo } }],
                    },
                ],
            },
            { orderBy: { updatedAt: QueryOrder.DESC }, limit },
        );

        return [emailAddressEntities.map(mapEntityToAggregate), count];
    }

    public async existsEmailAddress(address: string): Promise<boolean> {
        const emailAddressEntity: Option<EmailAddressEntity> = await this.em.findOne(
            EmailAddressEntity,
            { address: address },
            {},
        );

        return !!emailAddressEntity;
    }

    public async deactivateEmailAddress(emailAddress: string): Promise<EmailAddressEntity | EmailAddressNotFoundError> {
        const emailAddressEntity: Option<EmailAddressEntity> = await this.em.findOne(
            EmailAddressEntity,
            { address: emailAddress },
            {},
        );
        if (!emailAddressEntity) {
            return new EmailAddressNotFoundError(emailAddress);
        }

        emailAddressEntity.status = EmailAddressStatus.DISABLED;
        await this.em.persist(emailAddressEntity).flush();

        return emailAddressEntity;
    }

    public async getEmailAddressAndStatusForPerson(person: Person<true>): Promise<PersonEmailResponse | undefined> {
        const enabledEmailAddress: Option<EmailAddress<true>> = await this.findEnabledByPerson(person.id);
        if (enabledEmailAddress) {
            return new PersonEmailResponse(enabledEmailAddress.status, enabledEmailAddress.address);
        }
        const emailAddresses: Option<EmailAddress<true>[]> = await this.findByPersonSortedByUpdatedAtDesc(person.id);
        if (!emailAddresses || !emailAddresses[0]) {
            return undefined;
        }

        return new PersonEmailResponse(emailAddresses[0].status, emailAddresses[0].address);
    }

    /**
     * Returns a map with key-value pairs personId -> PersonEmailResponse.
     * NOTE: The value for a key is not a list of PersonEmailResponse but a single PersonEmailResponse, regardless how many ENABLED
     * EmailAddresses were found per personID in DB. The most recent one (based on updatedAt) will always override the last value in the map
     * for the specified personId.
     * Only enabled addresses will be part of the response, so the resulting map can return UNDEFINED for a personId
     * when either no email-addresses could be found for that person or only email-addresses with status other than ENABLED.
     * @param personIds
     */
    public async getEmailAddressAndStatusForPersonIds(
        personIds: PersonID[],
    ): Promise<Result<Map<PersonID, PersonEmailResponse>, DomainError>> {
        let lastUsedPersonId: PersonID;
        const addresses: EmailAddress<true>[] = await this.findEnabledByPersonIdsSortedByUpdatedAtDesc(personIds);
        const responseMap: Map<PersonID, PersonEmailResponse> = new Map<PersonID, PersonEmailResponse>();

        addresses.forEach((ea: EmailAddress<true>) => {
            if (lastUsedPersonId === ea.personId) {
                this.logger.error(
                    `Found multiple ENABLED EmailAddresses, treating ${ea.address} as latest address, personId:${ea.personId}`,
                );
            }
            assert(ea.personId); //EmailAddresses fetch via findEnabledByPersonIdsSortedByUpdatedAtDesc MUST HAVE a personId
            responseMap.set(ea.personId, new PersonEmailResponse(ea.status, ea.address));
            lastUsedPersonId = ea.personId;
        });

        return { ok: true, value: responseMap };
    }

    /**
     * Creates or updates entity in database. If the emailAddress parameter has status enabled or requested
     * and the referenced person already has an enabled email-address, PersonAlreadyHasEnabledEmailAddressError is returned.
     * @param emailAddress
     */
    public async save(emailAddress: EmailAddress<boolean>): Promise<EmailAddress<true> | DomainError> {
        if (emailAddress.enabledOrRequested && emailAddress.personId) {
            const enabledEmailAddressExists: Option<EmailAddress<true>> = await this.findEnabledByPerson(
                emailAddress.personId,
            );
            if (enabledEmailAddressExists) {
                return new PersonAlreadyHasEnabledEmailAddressError(emailAddress.personId, emailAddress.address);
            }
        }
        if (emailAddress.id) {
            return this.update(emailAddress);
        } else {
            return this.create(emailAddress);
        }
    }

    private async create(emailAddress: EmailAddress<boolean>): Promise<EmailAddress<true> | DomainError> {
        const emailAddressEntity: EmailAddressEntity = this.em.create(
            EmailAddressEntity,
            mapAggregateToData(emailAddress),
        );
        await this.em.persist(emailAddressEntity).flush();

        return mapEntityToAggregate(emailAddressEntity);
    }

    private async update(emailAddress: EmailAddress<boolean>): Promise<EmailAddress<true> | DomainError> {
        const emailAddressEntity: Option<EmailAddressEntity> = await this.em.findOne(EmailAddressEntity, {
            id: emailAddress.id,
        });

        if (emailAddressEntity) {
            emailAddressEntity.assign(mapAggregateToData(emailAddress), {});
            await this.em.persist(emailAddressEntity).flush();
        } else {
            this.logger.error(`Email-address:${emailAddress.currentAddress} could not be found`);
            return new EmailAddressNotFoundError(emailAddress.address);
        }

        return mapEntityToAggregate(emailAddressEntity);
    }

    /**
     * Deletes an EmailAddress by its ID. Returns a Defined Error on failure or Undefined on success.
     * @param id
     */
    public async deleteById(id: EmailAddressID): Promise<Option<DomainError>> {
        try {
            const emailAddressEntity: Loaded<EmailAddressEntity> = await this.em.findOneOrFail(EmailAddressEntity, {
                id,
            });
            const emailAddress: EmailAddress<true> = mapEntityToAggregate(emailAddressEntity);
            await this.em.remove(emailAddressEntity).flush();

            if (!emailAddress.oxUserID) {
                return new EmailAddressMissingOxUserIdError(emailAddress.id, emailAddress.address);
            }
            this.eventService.publish(
                new EmailAddressDeletedInDatabaseEvent(
                    emailAddress.personId,
                    emailAddress.oxUserID,
                    emailAddress.id,
                    emailAddress.status,
                    emailAddress.address,
                ),
                new KafkaEmailAddressDeletedInDatabaseEvent(
                    emailAddress.personId,
                    emailAddress.oxUserID,
                    emailAddress.id,
                    emailAddress.status,
                    emailAddress.address,
                ),
            );

            return undefined;
        } catch (err) {
            this.logger.logUnknownAsError('Error during deletion of EmailAddress', err);

            return new EmailAddressDeletionError(id);
        }
    }

    /**
     * @deprecated bandaid-solution for SPSH-3722, DO NOT USE!
     */
    public async setUpdatedAtToFixedPointInTime(id: EmailAddressID): Promise<void> {
        // 2027-08-01 00:00:00.000+00
        await this.em.nativeUpdate(EmailAddressEntity, { id }, { updatedAt: new Date(2027, 7) });
    }

    private getDeadlineInDaysForNonEnabledEmailAddresses(): number {
        return (
            this.emailInstanceConfig.NON_ENABLED_EMAIL_ADDRESSES_DEADLINE_IN_DAYS ??
            NON_ENABLED_EMAIL_ADDRESS_DEADLINE_IN_DAYS_DEFAULT
        );
    }
}
