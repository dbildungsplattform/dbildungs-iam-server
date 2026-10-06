import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ItsLearningConfig } from '../../../shared/config/itslearning.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { DomainError } from '../../../shared/error/index.js';
import { KafkaKlasseCreatedEvent } from '../../../shared/events/kafka-klasse-created.event.js';
import { KafkaKlasseUpdatedEvent } from '../../../shared/events/kafka-klasse-updated.event.js';
import { KafkaOrganisationDeletedEvent } from '../../../shared/events/kafka-organisation-deleted.event.js';
import { KafkaSchuleItslearningEnabledEvent } from '../../../shared/events/kafka-schule-itslearning-enabled.event.js';
import { KafkaSchuleUpdatedEvent } from '../../../shared/events/kafka-schule-updated.event.js';
import { KlasseCreatedEvent } from '../../../shared/events/klasse-created.event.js';
import { KlasseUpdatedEvent } from '../../../shared/events/klasse-updated.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { SchuleItslearningEnabledEvent } from '../../../shared/events/schule-itslearning-enabled.event.js';
import { SchuleUpdatedEvent } from '../../../shared/events/schule-updated.event.js';
import { OrganisationsTyp, RootDirectChildrenType } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { CreateGroupParams } from '../adapter/technical/actions/create-group.params.js';
import { UpdateGroupParams } from '../adapter/technical/actions/update-group.action.js';
import { ItslearningGroupAdapter } from '../adapter/domain/itslearning-group.adapter.js';
import { ItslearningGroupLengthLimits } from '../adapter/domain/groups.enum.js';

const SAFE_NAME_LIMIT: number = Math.floor(ItslearningGroupLengthLimits.SHORT_DESC * 0.75);

@Injectable()
export class ItsLearningOrganisationsEventHandler {
    public ENABLED: boolean;

    public readonly ROOT_OEFFENTLICH: string;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly organisationRepo: OrganisationRepository,
        private readonly itslearningGroupAdapter: ItslearningGroupAdapter,
        configService: ConfigService<ServerConfig>,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {
        const itsLearningConfig: ItsLearningConfig = configService.getOrThrow<ItsLearningConfig>('ITSLEARNING');

        this.ENABLED = itsLearningConfig.ENABLED;

        this.ROOT_OEFFENTLICH = itsLearningConfig.ROOT_OEFFENTLICH;
    }

    @KafkaEventHandler(KafkaKlasseCreatedEvent)
    @EventHandler(KlasseCreatedEvent)
    @EnsureRequestContext()
    public async createKlasseEventHandler(event: KlasseCreatedEvent): Promise<void> {
        this.logger.info(`[EventID: ${event.eventID}] Received KlasseCreatedEvent, ID: ${event.id}`);

        if (!this.ENABLED) {
            this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            return;
        }

        if (!event.administriertVon) {
            return this.logger.error(`[EventID: ${event.eventID}] Klasse has no parent organisation. Aborting.`);
        }

        if (!event.name) {
            return this.logger.error(`[EventID: ${event.eventID}] Klasse has no name. Aborting.`);
        }

        {
            // Check if parent is an itslearning schule
            const parent: Option<Organisation<true>> = await this.organisationRepo.findById(event.administriertVon);
            if (!parent?.itslearningEnabled) {
                return this.logger.info(
                    `[EventID: ${event.eventID}] Parent Organisation (${event.administriertVon}) is not an itslearning schule.`,
                );
            }
        }

        const params: CreateGroupParams = {
            id: event.id,
            name: this.makeKlasseName(event.name),
            type: 'Unspecified',
            parentId: event.administriertVon,
        };

        const createError: Option<DomainError> = await this.itslearningGroupAdapter.createOrUpdateGroup(
            params,
            `${event.eventID}-KLASSE-CREATED`,
        );

        if (createError) {
            return this.logger.error(
                `[EventID: ${event.eventID}] Could not create Klasse in itsLearning: ${createError.message}`,
            );
        }

        this.logger.info(`[EventID: ${event.eventID}] Klasse with ID ${event.id} created.`);
    }

    @KafkaEventHandler(KafkaKlasseUpdatedEvent)
    @EventHandler(KlasseUpdatedEvent)
    @EnsureRequestContext()
    public async updatedKlasseEventHandler(event: KlasseUpdatedEvent): Promise<void> {
        this.logger.info(
            `[EventID: ${event.eventID}] Received KlasseUpdatedEvent, ID: ${event.organisationId}, new name: ${event.name}`,
        );

        if (!this.ENABLED) {
            this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            return;
        }

        if (!event.administriertVon) {
            return this.logger.error(`[EventID: ${event.eventID}] Klasse has no parent organisation. Aborting.`);
        }

        if (!event.name) {
            return this.logger.error(`[EventID: ${event.eventID}] Klasse has no name. Aborting.`);
        }

        {
            // Check if parent is an itslearning schule
            const parent: Option<Organisation<true>> = await this.organisationRepo.findById(event.administriertVon);
            if (!parent?.itslearningEnabled) {
                return this.logger.info(
                    `[EventID: ${event.eventID}] Parent Organisation (${event.administriertVon}) is not an itslearning schule.`,
                );
            }
        }

        const params: UpdateGroupParams = {
            id: event.organisationId,
            name: this.makeKlasseName(event.name),
            type: 'Unspecified',
            parentId: event.administriertVon,
        };

        const createError: Option<DomainError> = await this.itslearningGroupAdapter.createOrUpdateGroup(
            params,
            `${event.eventID}-KLASSE-UPDATED`,
        );

        if (createError) {
            return this.logger.error(
                `[EventID: ${event.eventID}] Could not update Klasse in itsLearning: ${createError.message}`,
            );
        }

        this.logger.info(`[EventID: ${event.eventID}] Klasse with ID ${event.organisationId} was updated.`);
    }

    @KafkaEventHandler(KafkaSchuleItslearningEnabledEvent)
    @EventHandler(SchuleItslearningEnabledEvent)
    @EnsureRequestContext()
    public async schuleItslearningEnabledEventHandler(event: SchuleItslearningEnabledEvent): Promise<void> {
        this.logger.info(
            `[EventID: ${event.eventID}] Received EnableSchuleItslearningEvent, ID: ${event.organisationId}`,
        );

        if (!this.ENABLED) {
            this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            return;
        }

        if (event.typ !== OrganisationsTyp.SCHULE) {
            this.logger.error(
                `[EventID: ${event.eventID}] The organisation with ID ${event.organisationId} is not of type "SCHULE"!`,
            );
            return;
        }

        const [rootType, klassen]: [RootDirectChildrenType, Organisation<true>[]] = await Promise.all([
            this.organisationRepo.findOrganisationZuordnungErsatzOderOeffentlich(event.organisationId),
            this.organisationRepo.findChildOrgasForIds([event.organisationId]),
        ]);

        if (rootType === RootDirectChildrenType.ERSATZ) {
            this.logger.error(`[EventID: ${event.eventID}] Ersatzschule, ignoring.`);
            return;
        }

        // Create params for all klassen
        const createParams: CreateGroupParams[] = klassen
            .filter((k: Organisation<true>) => k.typ === OrganisationsTyp.KLASSE)
            .map((o: Organisation<true>) => ({
                id: o.id,
                name: this.makeKlasseName(o.name),
                type: 'Unspecified',
                parentId: event.organisationId,
            }));

        // Prepend the params for the schule
        createParams.unshift({
            id: event.organisationId,
            name: this.makeSchulName(event.kennung, event.name),
            type: 'School',
            parentId: this.ROOT_OEFFENTLICH,
        });

        const createError: Option<DomainError> = await this.itslearningGroupAdapter.createOrUpdateGroups(
            createParams,
            `${event.eventID}-SCHULE-SYNC`,
        );

        if (createError) {
            return this.logger.error(
                `[EventID: ${event.eventID}] Could not create Schule (ID ${event.organisationId}) and its Klassen in itsLearning: ${createError.message}`,
            );
        }

        this.logger.info(
            `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} and its ${klassen.length} Klassen were created.`,
        );
    }

    @KafkaEventHandler(KafkaSchuleUpdatedEvent)
    @EventHandler(SchuleUpdatedEvent)
    @EnsureRequestContext()
    public async schuleUpdatedEventHandler(event: SchuleUpdatedEvent): Promise<void> {
        this.logger.info(`[EventID: ${event.eventID}] Received SchuleUpdatedEvent, ID: ${event.organisationId}`);

        if (!this.ENABLED) {
            this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            return;
        }

        if (!event.itslearningEnabled) {
            this.logger.info(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} is not itslearning enabled. Ignoring event.`,
            );
            return;
        }

        const rootType: RootDirectChildrenType =
            await this.organisationRepo.findOrganisationZuordnungErsatzOderOeffentlich(event.organisationId);

        if (rootType === RootDirectChildrenType.ERSATZ) {
            this.logger.error(`[EventID: ${event.eventID}] Ersatzschule, ignoring.`);
            return;
        }

        const params: UpdateGroupParams = {
            id: event.organisationId,
            name: this.makeSchulName(event.kennung, event.name),
            type: 'School',
            parentId: this.ROOT_OEFFENTLICH,
        };

        const updateError: Option<DomainError> = await this.itslearningGroupAdapter.createOrUpdateGroup(
            params,
            `${event.eventID}-SCHULE-UPDATED`,
        );

        if (updateError) {
            return this.logger.error(
                `[EventID: ${event.eventID}] Could not update Schule (ID ${event.organisationId}) in itsLearning: ${updateError.message}`,
            );
        }

        this.logger.info(`[EventID: ${event.eventID}] Schule with ID ${event.organisationId} was updated.`);
    }

    @KafkaEventHandler(KafkaOrganisationDeletedEvent)
    @EventHandler(OrganisationDeletedEvent)
    public async organisationDeletedEventHandler(event: OrganisationDeletedEvent): Promise<void> {
        this.logger.info(`[EventID: ${event.eventID}] Received OrganisationDeletedEvent, ID: ${event.organisationId}`);

        if (!this.ENABLED) {
            this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            return;
        }

        if (event.typ !== OrganisationsTyp.SCHULE && event.typ !== OrganisationsTyp.KLASSE) {
            this.logger.error(
                `[EventID: ${event.eventID}] The organisation with ID ${event.organisationId} is not of type "SCHULE" or "KLASSE"!`,
            );
            return;
        }

        const deleteError: Option<DomainError> = await this.itslearningGroupAdapter.deleteGroup(
            event.organisationId,
            `${event.eventID}-ORGANISATION-DELETED`,
        );

        if (deleteError) {
            return this.logger.error(
                `[EventID: ${event.eventID}] Could not delete Schule (ID ${event.organisationId}) in itsLearning: ${deleteError.message}`,
            );
        }

        this.logger.info(`[EventID: ${event.eventID}] Schule with ID ${event.organisationId} was deleted.`);
    }

    private makeSchulName(dienststellennummer: string | undefined, name: string | undefined): string {
        const dienststellennummerOrDefault: string = dienststellennummer || 'Unbekannte Dienststellennummer';
        const nameOrDefault: string = name || 'Unbenannte Schule';

        // 75% of hard limit, subtract length of the dienststellennummer and 3 for the space and two parentheses
        const spaceForName: number = SAFE_NAME_LIMIT - dienststellennummerOrDefault.length - 3;

        let truncatedSchoolName: string = nameOrDefault;
        if (truncatedSchoolName.length > spaceForName) {
            truncatedSchoolName = `${truncatedSchoolName.slice(0, spaceForName - 3)}...`;
        }

        const fullName: string = `${dienststellennummerOrDefault} (${truncatedSchoolName})`;
        return fullName;
    }

    private makeKlasseName(name: string | undefined): string {
        const nameOrDefault: string = name || 'Unbenannte Klasse';

        let truncatedClassName: string = nameOrDefault;
        if (truncatedClassName.length > SAFE_NAME_LIMIT) {
            truncatedClassName = `${truncatedClassName.slice(0, SAFE_NAME_LIMIT - 3)}...`;
        }

        return truncatedClassName;
    }
}
