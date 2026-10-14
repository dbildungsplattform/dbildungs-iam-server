import { EntityManager, Loaded, FilterQuery } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { KafkaLocksForPersonChangedEvent } from '../../../shared/events/kafka-locks-for-person-changed.event.js';
import {
    LocksForPersonChangedEvent,
    UserLockEventData,
} from '../../../shared/events/locks-for-person-changed.event.js';
import { UserLock } from '../domain/user-lock.js';
import { UserLockEntity } from '../entity/user-lock.entity.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { PersonLockOccasion } from '../../person/domain/person.enums.js';

export function mapEntityToAggregate(entity: UserLockEntity): UserLock {
    return UserLock.construct(
        entity.person.id,
        entity.locked_by,
        entity.locked_until,
        entity.locked_occasion,
        entity.createdAt,
    );
}

// Disable explicit types here because it's virtually impossible to do this correctly
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function mapAggregateToData(userLock: UserLock) {
    return {
        person: userLock.person,
        locked_by: userLock.locked_by,
        locked_until: userLock.locked_until,
        locked_occasion: userLock.locked_occasion,
    };
}

export function mapEntityToAggregateInplace(entity: UserLockEntity, userLock: UserLock): UserLock {
    userLock.person = entity.person.id;
    userLock.locked_by = entity.locked_by;
    userLock.locked_until = entity.locked_until;
    userLock.locked_occasion = entity.locked_occasion;

    return userLock;
}

@Injectable()
export class UserLockRepository {
    public constructor(
        private readonly em: EntityManager,
        private readonly eventService: EventRoutingLegacyKafkaService,
    ) {}

    public async findByPersonId(id: PersonID): Promise<UserLock[]> {
        const users: Option<UserLockEntity[]> = await this.em.find(UserLockEntity, { person: id });
        return users.map(mapEntityToAggregate);
    }

    public async findByPersonIds(personIds: PersonID[]): Promise<Map<PersonID, UserLock[]>> {
        const result: Map<PersonID, UserLock[]> = new Map<PersonID, UserLock[]>();

        if (personIds.length === 0) {
            return result;
        }

        const userLockEntities: UserLockEntity[] = await this.em.find(UserLockEntity, {
            person: { $in: personIds },
        });

        for (const entity of userLockEntities) {
            const personId: string = entity.person.id;
            const lock: UserLock = mapEntityToAggregate(entity);

            if (!result.has(personId)) {
                result.set(personId, []);
            }

            result.get(personId)!.push(lock);
        }
        for (const id of personIds) {
            if (!result.has(id)) {
                result.set(id, []);
            }
        }

        return result;
    }

    public async createUserLock(userLock: UserLock): Promise<UserLock | DomainError> {
        const oldLocks: UserLock[] = await this.findByPersonId(userLock.person);
        const userLockEntity: UserLockEntity = this.em.create(UserLockEntity, mapAggregateToData(userLock));
        await this.em.persist(userLockEntity).flush();

        const createdUserLock: UserLock = mapEntityToAggregateInplace(userLockEntity, userLock);
        const newLocks: UserLock[] = await this.findByPersonId(userLock.person);
        this.publishLocksForPersonChanged(userLock.person, oldLocks, newLocks);

        return createdUserLock;
    }

    public async update(userLock: UserLock): Promise<UserLock | DomainError> {
        const oldLocks: UserLock[] = await this.findByPersonId(userLock.person);
        const userLockEntity: Loaded<UserLockEntity> = await this.em.findOneOrFail(UserLockEntity, {
            person: userLock.person,
        });
        userLockEntity.assign(mapAggregateToData(userLock));
        await this.em.persist(userLockEntity).flush();
        const updatedUserLock: UserLock = mapEntityToAggregate(userLockEntity);
        const newLocks: UserLock[] = await this.findByPersonId(userLock.person);
        this.publishLocksForPersonChanged(userLock.person, oldLocks, newLocks);

        return updatedUserLock;
    }

    public async deleteUserLock(personId: string, lockOccasion: PersonLockOccasion): Promise<void> {
        const oldLocks: UserLock[] = await this.findByPersonId(personId);
        const deletedCount: number = await this.em.nativeDelete(UserLockEntity, {
            person: personId,
            locked_occasion: lockOccasion,
        });

        if (deletedCount === 0) {
            return;
        }

        const newLocks: UserLock[] = await this.findByPersonId(personId);
        this.publishLocksForPersonChanged(personId, oldLocks, newLocks);
    }

    public async getLocksToUnlock(): Promise<UserLock[]> {
        const today: Date = new Date();

        const filters: FilterQuery<UserLockEntity> = {
            locked_until: { $lte: today },
        };

        const userLockEntities: UserLockEntity[] = await this.em.find(UserLockEntity, filters);
        return userLockEntities.map((userlock: UserLockEntity) => mapEntityToAggregate(userlock));
    }

    private publishLocksForPersonChanged(personId: PersonID, oldLocks: UserLock[], newLocks: UserLock[]): void {
        const oldLockData: UserLockEventData[] = this.mapLocksForEvent(oldLocks);
        const newLockData: UserLockEventData[] = this.mapLocksForEvent(newLocks);

        this.eventService.publish(
            new LocksForPersonChangedEvent(personId, oldLockData, newLockData),
            new KafkaLocksForPersonChangedEvent(personId, oldLockData, newLockData),
        );
    }

    private mapLocksForEvent(userLocks: UserLock[]): UserLockEventData[] {
        return userLocks
            .map((userLock: UserLock) => ({
                locked_until: userLock.locked_until,
                locked_occasion: userLock.locked_occasion,
            }))
            .sort((firstLock: UserLockEventData, secondLock: UserLockEventData) =>
                firstLock.locked_occasion.localeCompare(secondLock.locked_occasion),
            );
    }
}
