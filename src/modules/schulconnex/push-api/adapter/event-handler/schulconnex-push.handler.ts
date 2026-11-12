import { Injectable } from '@nestjs/common';
import { EmailMicroserviceAddressChangedEvent } from '../../../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { LocksForPersonChangedEvent } from '../../../../../shared/events/locks-for-person-changed.event.js';
import { PersonID } from '../../../../../shared/types/aggregate-ids.types.js';
import { SchulconnexPushAdapter } from '../domain/schulconnex-push.adapter.js';
import { EmailResolverService } from '../../../../email-microservice/domain/email-resolver.service.js';
import { UserLockRepository } from '../../../../keycloak-administration/repository/user-lock.repository.js';
import {
    DBiamPersonenkontextRepo,
    KontextWithOrgaAndRolle,
} from '../../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { SchulconnexPushRegistryRepo } from '../../persistence/schulconnex-push-registry.repo.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { SchulconnexPushRegistry } from '../../domain/schulconnex-push-registry.js';
import { DomainError, SchulconnexPushError } from '../../../../../shared/error/index.js';
import { EventHandler } from '../../../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { KafkaEmailMicroserviceAddressChangedEvent } from '../../../../../shared/events/email-microservice/kafka-email-microservice-address-changed.event.js';
import { KafkaLocksForPersonChangedEvent } from '../../../../../shared/events/kafka-locks-for-person-changed.event.js';
import { UserLock } from '../../../../keycloak-administration/domain/user-lock.js';
import { PersonEmailResponse } from '../../../../person/api/person-email-response.js';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/core';
import { Mutex } from 'async-mutex';
import { Err, Ok } from '../../../../../shared/util/result.js';

@Injectable()
export class SchulconnexPushHandler {
    private readonly personUpdateMutexes: Map<PersonID, Mutex> = new Map();

    public constructor(
        private readonly logger: ClassLogger,
        private readonly pushAdapter: SchulconnexPushAdapter,
        private readonly pushRegistryRepo: SchulconnexPushRegistryRepo,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly userLockRepo: UserLockRepository,
        private readonly emailResolverService: EmailResolverService,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {}

    @KafkaEventHandler(KafkaEmailMicroserviceAddressChangedEvent)
    @EventHandler(EmailMicroserviceAddressChangedEvent)
    @EnsureRequestContext()
    public async handleEmailAddressChanged(
        event: EmailMicroserviceAddressChangedEvent,
    ): Promise<Result<void, DomainError>> {
        this.logger.info(
            `[EventID: ${event.eventID}] Received EmailMicroserviceAddressChangedEvent for person ${event.personId}`,
        );

        return this.updatePersonenkontexte(event.personId, event.eventID);
    }

    @KafkaEventHandler(KafkaLocksForPersonChangedEvent)
    @EventHandler(LocksForPersonChangedEvent)
    @EnsureRequestContext()
    public async handleLocksForPersonChanged(event: LocksForPersonChangedEvent): Promise<Result<void, DomainError>> {
        this.logger.info(
            `[EventID: ${event.eventID}] Received LocksForPersonChangedEvent for person ${event.personId}`,
        );

        return this.updatePersonenkontexte(event.personId, event.eventID);
    }

    private async updatePersonenkontexte(personId: PersonID, eventId: string): Promise<Result<void, DomainError>> {
        const mutex: Mutex = this.personUpdateMutexes.get(personId) ?? new Mutex();

        this.personUpdateMutexes.set(personId, mutex);

        try {
            return await mutex.runExclusive(
                (): Promise<Result<void, DomainError>> => this.updatePersonenkontexteExclusive(personId, eventId),
            );
        } finally {
            if (!mutex.isLocked()) {
                this.personUpdateMutexes.delete(personId);
            }
        }
    }

    private async updatePersonenkontexteExclusive(
        personId: PersonID,
        eventId: string,
    ): Promise<Result<void, DomainError>> {
        const [registries, userLocks, email]: [
            SchulconnexPushRegistry<true>[],
            UserLock[],
            Option<PersonEmailResponse>,
        ] = await Promise.all([
            this.pushRegistryRepo.findAll(),
            this.userLockRepo.findByPersonId(personId),
            this.emailResolverService.findEmailBySpshPerson(personId),
        ]);

        const errors: DomainError[] = [];

        for (const registry of registries) {
            const kontexte: KontextWithOrgaAndRolle[] =
                // eslint-disable-next-line no-await-in-loop
                await this.personenkontextRepo.findByPersonAndServiceProviderWithOrgaAndRolle(
                    personId,
                    registry.serviceProviderId,
                );

            for (const kontext of kontexte) {
                // eslint-disable-next-line no-await-in-loop
                const result: Result<void, DomainError> = await this.pushAdapter.upsertPersonenkontext(
                    registry,
                    kontext,
                    userLocks,
                    email,
                );

                if (!result.ok) {
                    errors.push(result.error);

                    this.logger.logUnknownAsError(
                        `[EventID: ${eventId}] Could not update Personenkontext ${kontext.personenkontext.id} for person ${personId}`,
                        result.error,
                    );
                }
            }
        }

        if (errors.length > 0) {
            return Err(
                new SchulconnexPushError(`Could not update all Personenkontexte for person ${personId}`, errors),
            );
        }

        return Ok();
    }
}
