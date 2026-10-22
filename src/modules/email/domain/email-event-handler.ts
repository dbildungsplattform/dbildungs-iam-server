import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { OxServerConfig } from '../../../shared/config/ox-server.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { DomainError } from '../../../shared/error/index.js';
import { DisabledOxUserChangedEvent } from '../../../shared/events/ox/disabled-ox-user-changed.event.js';
import { KafkaDisabledOxUserChangedEvent } from '../../../shared/events/ox/kafka-disabled-ox-user-changed.event.js';
import { KafkaOxSyncUserCreatedEvent } from '../../../shared/events/ox/kafka-ox-sync-user-created.event.js';
import { KafkaOxUserChangedEvent } from '../../../shared/events/ox/kafka-ox-user-changed.event.js';
import { OxSyncUserCreatedEvent } from '../../../shared/events/ox/ox-sync-user-created.event.js';
import { OxUserChangedEvent } from '../../../shared/events/ox/ox-user-changed.event.js';
import { EmailRepo } from '../persistence/email.repo.js';
import { EmailAddress } from './email-address.js';

@Injectable()
export class EmailEventHandler {
    public OX_ENABLED: boolean;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly emailRepo: EmailRepo,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
        configService: ConfigService<ServerConfig>,
    ) {
        const oxConfig: OxServerConfig = configService.getOrThrow<OxServerConfig>('OX');
        this.OX_ENABLED = oxConfig.ENABLED;
    }

    @KafkaEventHandler(KafkaOxSyncUserCreatedEvent)
    @EventHandler(OxSyncUserCreatedEvent)
    @EnsureRequestContext()
    public async handleOxSyncUserCreatedEvent(event: OxSyncUserCreatedEvent): Promise<void> {
        this.logger.info(
            `Received OxSyncUserCreatedEvent personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, oxUserName:${event.oxUserName}, contextName:${event.oxContextName}, email:${event.primaryEmail}`,
        );
        await this.handleOxUserChangedEventOrOxSyncUserCreatedEvent(event);
    }

    @KafkaEventHandler(KafkaOxUserChangedEvent)
    @EventHandler(OxUserChangedEvent)
    @EnsureRequestContext()
    public async handleOxUserChangedEvent(event: OxUserChangedEvent): Promise<void> {
        this.logger.info(
            `Received OxUserChangedEvent personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, oxUserName:${event.oxUserName}, contextName:${event.oxContextName}, email:${event.primaryEmail}`,
        );
        await this.handleOxUserChangedEventOrOxSyncUserCreatedEvent(event);
    }

    private async handleOxUserChangedEventOrOxSyncUserCreatedEvent(event: OxUserChangedEvent): Promise<void> {
        const email: Option<EmailAddress<true>> = await this.emailRepo.findRequestedByPerson(event.personId);

        if (!email) {
            return this.logger.info(
                `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, enabling not necessary`,
            );
        }

        if (email.address !== event.primaryEmail) {
            this.logger.warning(
                `Mismatch between REQUESTED(${email.address}) and received(${event.primaryEmail}) address from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}`,
            );
            this.logger.warning(
                `Overriding ${email.address} with ${event.primaryEmail}) from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}`,
            );
            email.setAddress(event.primaryEmail);
        }

        email.enable();
        email.oxUserID = event.oxUserId;
        const persistenceResult: EmailAddress<true> | DomainError = await this.emailRepo.save(email);

        if (persistenceResult instanceof DomainError) {
            this.logger.error('Irgendwas ist immer...');
            return this.logger.error(
                `Could not ENABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, error:${persistenceResult.message}`,
            );
        } else {
            return this.logger.info(
                `Changed email-address:${persistenceResult.address} from REQUESTED to ENABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}`,
            );
        }
    }

    @KafkaEventHandler(KafkaDisabledOxUserChangedEvent)
    @EventHandler(DisabledOxUserChangedEvent)
    @EnsureRequestContext()
    public async handleDisabledOxUserChangedEvent(event: DisabledOxUserChangedEvent): Promise<void> {
        this.logger.info(
            `Received DisabledOxUserChangedEvent personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, oxUserName:${event.oxUserName}, contextName:${event.oxContextName}, email:${event.primaryEmail}`,
        );
        const email: Option<EmailAddress<true>> = await this.emailRepo.findRequestedByPerson(event.personId);

        if (!email) {
            return this.logger.error(
                `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, DISABLING not possible`,
            );
        }

        email.disable();
        email.oxUserID = event.oxUserId;
        const persistenceResult: EmailAddress<true> | DomainError = await this.emailRepo.save(email);

        if (persistenceResult instanceof DomainError) {
            return this.logger.error(
                `Could not DISABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, error:${persistenceResult.message}`,
            );
        } else {
            return this.logger.info(
                `Changed email-address:${persistenceResult.address} from REQUESTED to DISABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}`,
            );
        }
    }
}
