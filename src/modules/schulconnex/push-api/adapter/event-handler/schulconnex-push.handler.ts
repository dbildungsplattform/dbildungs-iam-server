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
import { DomainError } from '../../../../../shared/error/index.js';
import { EventHandler } from '../../../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { KafkaEmailMicroserviceAddressChangedEvent } from '../../../../../shared/events/email-microservice/kafka-email-microservice-address-changed.event.js';
import { KafkaLocksForPersonChangedEvent } from '../../../../../shared/events/kafka-locks-for-person-changed.event.js';
import { UserLock } from '../../../../keycloak-administration/domain/user-lock.js';
import { PersonEmailResponse } from '../../../../person/api/person-email-response.js';

@Injectable()
export class SchulconnexPushHandler {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly pushAdapter: SchulconnexPushAdapter,
        private readonly pushRegistryRepo: SchulconnexPushRegistryRepo,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly userLockRepo: UserLockRepository,
        private readonly emailResolverService: EmailResolverService,
    ) {}

    @KafkaEventHandler(KafkaEmailMicroserviceAddressChangedEvent)
    @EventHandler(EmailMicroserviceAddressChangedEvent)
    public async handleEmailAddressChanged(event: EmailMicroserviceAddressChangedEvent): Promise<void> {
        this.logger.info(
            `[EventID: ${event.eventID}] Received EmailMicroserviceAddressChangedEvent for person ${event.personId}`,
        );

        await this.updatePersonenkontexte(event.personId, event.eventID);
    }

    @KafkaEventHandler(KafkaLocksForPersonChangedEvent)
    @EventHandler(LocksForPersonChangedEvent)
    public async handleLocksForPersonChanged(event: LocksForPersonChangedEvent): Promise<void> {
        this.logger.info(
            `[EventID: ${event.eventID}] Received LocksForPersonChangedEvent for person ${event.personId}`,
        );

        await this.updatePersonenkontexte(event.personId, event.eventID);
    }

    private async updatePersonenkontexte(personId: PersonID, eventId: string): Promise<void> {
        const [registries, userLocks, emailResult]: [
            SchulconnexPushRegistry<true>[],
            UserLock[],
            Result<Map<PersonID, PersonEmailResponse | undefined>, DomainError>,
        ] = await Promise.all([
            this.pushRegistryRepo.findAll(),
            this.userLockRepo.findByPersonId(personId),
            this.emailResolverService.findEmailsBySpshPersons([personId]),
        ]);

        if (!emailResult.ok) {
            this.logger.logUnknownAsError(
                `[EventID: ${eventId}] Could not resolve email for person ${personId}`,
                emailResult.error,
            );
            return;
        }

        const email: Option<PersonEmailResponse> = emailResult.value.get(personId);

        await Promise.all(
            registries.map(async (registry: SchulconnexPushRegistry<true>): Promise<void> => {
                const kontexte: KontextWithOrgaAndRolle[] =
                    await this.personenkontextRepo.findByPersonAndServiceProviderWithOrgaAndRolle(
                        personId,
                        registry.serviceProviderId,
                    );

                await Promise.all(
                    kontexte.map(async (kontext: KontextWithOrgaAndRolle): Promise<void> => {
                        const result: Result<void, DomainError> = await this.pushAdapter.upsertPersonenkontext(
                            registry,
                            kontext,
                            userLocks,
                            email,
                        );

                        if (!result.ok) {
                            this.logger.logUnknownAsError(
                                `[EventID: ${eventId}] Could not update Personenkontext ${kontext.personenkontext.id} for person ${personId}`,
                                result.error,
                            );
                        }
                    }),
                );
            }),
        );
    }
}
