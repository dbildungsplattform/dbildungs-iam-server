import { EntityManager, Loaded } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { uniq } from 'lodash-es';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { DomainError, EntityNotFoundError } from '../../../../shared/error/index.js';
import { PersonID } from '../../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { EmailAddress, EmailAddressStatus } from '../domain/email-address.js';
import { EmailAddressNotFoundError } from '../error/email-address-not-found.error.js';
import { EmailAddressStatusEntity, EmailAddressStatusEnum } from './email-address-status.entity.js';
import { EmailAddrEntity } from './email-address.entity.js';

// Disable explicit types here because it's virtually impossible to do this correctly
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mapAggregateToData(emailAddress: EmailAddress<boolean>) {
    // eslint-disable-next-line @typescript-eslint/typedef
    const statuses = emailAddress.sortedStatuses.map((s: EmailAddressStatus) => ({
        id: s.id,
        status: s.status,
    }));

    return {
        // Don't assign createdAt and updatedAt, they are auto-generated!
        id: emailAddress.id,
        address: emailAddress.address,
        priority: emailAddress.priority,
        spshPersonId: emailAddress.spshPersonId,
        externalId: emailAddress.externalId,
        oxUserCounter: emailAddress.oxUserCounter,
        markedForCron: emailAddress.markedForCron,
        statuses,
    };
}

function mapEntityToAggregate(entity: EmailAddrEntity): EmailAddress<boolean> {
    const sortedStatuses: EmailAddressStatus[] = entity.statuses.map((s: EmailAddressStatusEntity) => ({
        id: s.id,
        status: s.status,
    }));

    return EmailAddress.construct({
        id: entity.id,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        address: entity.address,
        priority: entity.priority,
        spshPersonId: entity.spshPersonId,
        oxUserCounter: entity.oxUserCounter,
        externalId: entity.externalId,
        markedForCron: entity.markedForCron,
        sortedStatuses,
    });
}

@Injectable()
export class EmailAddressRepo {
    public constructor(
        private readonly em: EntityManager,
        private readonly logger: ClassLogger,
    ) {}

    public async findDistinctSpshPersonIdsSameOrEarlierThanMarkedForCronAndPrioLte1(
        markedForCron: Date,
    ): Promise<string[]> {
        const entities: Loaded<EmailAddrEntity, never, 'spshPersonId', never>[] = await this.em.find(
            EmailAddrEntity,
            { markedForCron: { $lte: markedForCron }, priority: { $lte: 1 } },
            {
                fields: ['spshPersonId'],
                orderBy: { spshPersonId: 'ASC' },
            },
        );

        return uniq(entities.map((e: Loaded<EmailAddrEntity, never, 'spshPersonId', never>) => e.spshPersonId));
    }

    public async deleteAllMarkedForCronSameOrEarlierDayWithPriorityGte2(markedForCron: Date): Promise<number> {
        const deleted: number = await this.em.nativeDelete(EmailAddrEntity, {
            markedForCron: { $ne: null, $lte: markedForCron },
            priority: { $gte: 2 },
        });

        return deleted;
    }

    public async findEmailAddress(address: string): Promise<Option<EmailAddress<true>>> {
        const emailAddressEntity: Option<EmailAddrEntity> = await this.em.findOne(EmailAddrEntity, {
            address: address,
        });

        if (emailAddressEntity) {
            return mapEntityToAggregate(emailAddressEntity);
        }

        return undefined;
    }

    public async existsEmailAddress(address: string): Promise<boolean> {
        const emailAddressEntity: Option<EmailAddrEntity> = await this.em.findOne(EmailAddrEntity, {
            address: address,
        });

        return !!emailAddressEntity;
    }

    public async findBySpshPersonIdSortedByPriorityAsc(spshPersonId: string): Promise<EmailAddress<true>[]> {
        const emailAddressEntities: Option<EmailAddrEntity[]> = await this.em.find(
            EmailAddrEntity,
            { spshPersonId: { $eq: spshPersonId } },
            { orderBy: { priority: 'asc' } },
        );

        return emailAddressEntities.map(mapEntityToAggregate);
    }

    public async findPrimaryBySpshPersonIds(spshPersonIds: string[]): Promise<EmailAddress<true>[]> {
        const emailAddressEntities: Option<EmailAddrEntity[]> = await this.em.find(EmailAddrEntity, {
            spshPersonId: { $in: spshPersonIds },
            priority: 0,
        });

        const result: EmailAddress<true>[] = [];

        for (const entity of emailAddressEntities) {
            const newestStatus: EmailAddressStatusEntity | undefined = entity.statuses.getItems()[0];

            if (newestStatus?.status === EmailAddressStatusEnum.ACTIVE) {
                result.push(mapEntityToAggregate(entity));
            }
        }

        return result;
    }

    /**
     * Takes in an email-address (needs to already be persisted!) and a target priority X.
     * At the end, the given email will have priority X.
     * If there already was an email with priority X, that one will have priority X+1.
     * If X+1 was also already used, THAT email will end up at X+2 and so on.
     *
     * Example:
     *
     * Before:
     * Priority: 0   1   2   3   4   5
     * E-Mail  : A   B   C   _   D   E
     *
     * After shiftPriorities(E, 1):
     * Priority: 0   1   2   3   4   5
     * E-Mail  : A   E   B   C   D   _
     *
     * @param emailAddress an email that is already persisted in the DB (caution: this function will not save the aggregate, just update the priority)
     * @param targetPriority the priority the given address should have afterwards
     *
     * @returns The updated e-mail aggregates
     */
    public async shiftPriorities(
        emailAddress: EmailAddress<true>,
        targetPriority: number,
    ): Promise<Result<EmailAddress<true>[], DomainError>> {
        return this.em.transactional(async (em: EntityManager) => {
            const emails: EmailAddrEntity[] = await em.find(
                EmailAddrEntity,
                {
                    spshPersonId: emailAddress.spshPersonId,
                },
                {
                    orderBy: { priority: 'asc' },
                },
            );

            const targetEmailAddressIdx: number = emails.findIndex((em: EmailAddrEntity) => em.id === emailAddress.id);

            if (targetEmailAddressIdx < 0) {
                return Err(new EntityNotFoundError('EmailAddress', emailAddress.id));
            }

            // Null assertion is valid because of the check above
            const targetEmailAddress: EmailAddrEntity = emails.splice(targetEmailAddressIdx, 1)[0]!;

            // Shift all emails that need to be moved
            let priorityToMove: number = targetPriority;
            for (const mail of emails) {
                if (mail.priority === priorityToMove) {
                    mail.priority += 1;
                    priorityToMove += 1;
                    em.persist(mail);
                }
            }

            targetEmailAddress.priority = targetPriority;
            em.persist(targetEmailAddress);

            await em.flush();

            return Ok([targetEmailAddress, ...emails].map(mapEntityToAggregate));
        });
    }

    /**
     * Ensures the following things:
     * - The address with priority 0 should not be marked for cron (if it has a date, the date will be removed)
     * - All addresses with priority >=1 should be marked for cron (if it does not have a date, the date will be set to the given date)
     * - All addresses with priority >= 2 should not have an ACTIVE status. If they do, a DEACTIVE status will be set
     */
    public async ensureStatusesAndCronDateForPerson(
        spshPersonId: PersonID,
        cronDate: Date,
    ): Promise<EmailAddress<true>[]> {
        return this.em.transactional(async (em: EntityManager) => {
            const emails: EmailAddrEntity[] = await em.find(EmailAddrEntity, {
                spshPersonId,
            });

            for (const email of emails) {
                // Ensure the primary email has no cron date
                if (email.priority === 0) {
                    email.markedForCron = undefined;
                }

                // Ensure all emails with priority 1 or higher have a cron date
                if (email.priority >= 1) {
                    email.markedForCron ??= cronDate;
                }

                // Ensure there are no emails with priority 2 or higher with status "ACTIVE"
                if (email.priority >= 2) {
                    const newestStatus: EmailAddressStatusEntity | undefined = email.statuses.getItems()[0];

                    if (
                        !newestStatus ||
                        newestStatus.status === EmailAddressStatusEnum.ACTIVE ||
                        newestStatus.status === EmailAddressStatusEnum.SUSPENDED
                    ) {
                        email.statuses.add(
                            em.create(EmailAddressStatusEntity, {
                                emailAddress: email,
                                status: EmailAddressStatusEnum.DEACTIVE,
                            }),
                        );
                    }
                }

                em.persist(email);
            }

            await em.flush();

            return emails.map(mapEntityToAggregate);
        });
    }

    public async save(emailAddress: EmailAddress<boolean>): Promise<Result<EmailAddress<true>, DomainError>> {
        if (emailAddress.id) {
            return this.update(emailAddress);
        } else {
            return this.create(emailAddress);
        }
    }

    private async create(emailAddress: EmailAddress<boolean>): Promise<Result<EmailAddress<true>, DomainError>> {
        const emailAddressEntity: EmailAddrEntity = this.em.create(EmailAddrEntity, mapAggregateToData(emailAddress));
        await this.em.persist(emailAddressEntity).flush();

        return Ok(mapEntityToAggregate(emailAddressEntity));
    }

    private async update(emailAddress: EmailAddress<boolean>): Promise<Result<EmailAddress<true>, DomainError>> {
        const emailAddressEntity: Option<EmailAddrEntity> = await this.em.findOne(EmailAddrEntity, {
            id: emailAddress.id,
        });

        if (emailAddressEntity) {
            emailAddressEntity.assign(mapAggregateToData(emailAddress), {});
            await this.em.persist(emailAddressEntity).flush();
        } else {
            this.logger.error(`Email-Address:${emailAddress.address} with id ${emailAddress.id} could not be found`);
            return Err(new EmailAddressNotFoundError(emailAddress.address));
        }

        return Ok(mapEntityToAggregate(emailAddressEntity));
    }

    public async delete(emailAddress: EmailAddress<true>): Promise<void> {
        await this.em.nativeDelete(EmailAddrEntity, emailAddress.id);
    }

    public async updateExternalIdForSpshPerson(spshPersonId: string, newExternalId: string): Promise<void> {
        await this.em.nativeUpdate(EmailAddrEntity, { spshPersonId }, { externalId: newExternalId });
    }
}
