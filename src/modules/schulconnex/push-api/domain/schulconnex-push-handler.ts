import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';

import { EventHandler } from '../../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { type DomainError, SchulconnexPushError } from '../../../../shared/error/index.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../../../shared/events/kafka-personenkontext-updated.event.js';
import { type PersonenkontextEventKontextData } from '../../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../../shared/events/personenkontext-updated.event.js';
import { type PersonID, type PersonenkontextID, type RolleID } from '../../../../shared/types/index.js';
import { Err, Ok } from '../../../../shared/util/result.js';
import { EmailResolverService } from '../../../email-microservice/domain/email-resolver.service.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    type KontextWithOrgaAndRolle,
} from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { type Rolle } from '../../../rolle/domain/rolle.js';
import { RolleRepo } from '../../../rolle/repo/rolle.repo.js';
import { type PersonenInfoData } from '../../domain/personeninfo/personeninfo-data.js';
import { SchulconnexPushAdapter } from '../adapter/domain/schulconnex-push.adapter.js';
import { SchulconnexPushRegistryRepo } from '../persistence/schulconnex-push-registry.repo.js';
import { type SchulconnexPushRegistry } from './schulconnex-push-registry.js';

@Injectable()
export class SchulconnexPushHandler {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly registryRepo: SchulconnexPushRegistryRepo,
        private readonly rolleRepo: RolleRepo,
        private readonly personRepo: PersonRepository,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly userLockRepo: UserLockRepository,
        private readonly emailResolverService: EmailResolverService,
        private readonly adapter: SchulconnexPushAdapter,
        private readonly em: EntityManager,
    ) {}

    @EventHandler(PersonenkontextUpdatedEvent)
    @KafkaEventHandler(KafkaPersonenkontextUpdatedEvent)
    @EnsureRequestContext((handler: SchulconnexPushHandler) => handler.em)
    public async handlePersonenkontextUpdatedEvent(
        event: PersonenkontextUpdatedEvent,
    ): Promise<Result<void, DomainError>> {
        const logPrefix: string = `[EventID: ${event.eventID}] Schulconnex push for person ${event.person.id}`;
        this.logger.info(`${logPrefix}: Received PersonenkontextUpdatedEvent`);

        const registries: SchulconnexPushRegistry<true>[] = await this.registryRepo.findAll();
        if (registries.length === 0) {
            return Ok();
        }

        const rolleIds: RolleID[] = [
            ...new Set(
                [...event.newKontexte, ...event.removedKontexte, ...event.currentKontexte]
                    .filter((pk: PersonenkontextEventKontextData) => pk.orgaTyp !== OrganisationsTyp.KLASSE)
                    .map((pk: PersonenkontextEventKontextData) => pk.rolleId),
            ),
        ];
        const rollen: Map<RolleID, Rolle<true>> = await this.rolleRepo.findByIds(rolleIds);
        const results: PromiseSettledResult<Result<void, DomainError>>[] = await Promise.allSettled(
            registries
                .filter((registry: SchulconnexPushRegistry<true>) => this.createRegistryKontextFilter(registry, rollen))
                .map((registry: SchulconnexPushRegistry<true>) =>
                    this.pushPersonenkontextUpdatedEventToRegistry(event, registry, rollen),
                ),
        );
        const failures: unknown[] = this.collectAndLogFailures(results, registries, logPrefix);

        return failures.length > 0 ? Err(new SchulconnexPushError(`${logPrefix} failed`, failures)) : Ok();
    }

    private collectAndLogFailures(
        results: PromiseSettledResult<Result<void, DomainError>>[],
        registries: SchulconnexPushRegistry<true>[],
        logPrefix: string,
    ): unknown[] {
        const failures: unknown[] = [];
        results.forEach((result: PromiseSettledResult<Result<void, DomainError>>, index: number) => {
            let error: unknown;
            if (result.status === 'rejected') {
                error = result.reason;
            } else if (!result.value.ok) {
                error = result.value.error;
            } else {
                return;
            }
            failures.push(error);
            this.logger.logUnknownAsError(`${logPrefix}: Registry ${registries[index]?.id} failed`, error);
        });

        return failures;
    }

    private async pushPersonenkontextUpdatedEventToRegistry(
        event: PersonenkontextUpdatedEvent,
        registry: SchulconnexPushRegistry<true>,
        rollen: Map<RolleID, Rolle<true>>,
    ): Promise<Result<void, DomainError>> {
        const newKontexte: PersonenkontextEventKontextData[] = event.newKontexte.filter(
            this.createRegistryKontextFilter(registry, rollen),
        );
        const removedKontexte: PersonenkontextEventKontextData[] = event.removedKontexte.filter(
            this.createRegistryKontextFilter(registry, rollen),
        );
        const currentKontexte: PersonenkontextEventKontextData[] = event.currentKontexte.filter(
            this.createRegistryKontextFilter(registry, rollen),
        );
        if (newKontexte.length === 0 && removedKontexte.length === 0) {
            return Ok();
        }

        const newIds: Set<PersonenkontextID> = new Set(newKontexte.map((pk: PersonenkontextEventKontextData) => pk.id));
        const hadRelevantKontexte: boolean = this.hadRelevantKontexteBefore(removedKontexte, currentKontexte, newIds);
        const kontexteToUpsert: PersonenkontextEventKontextData[] = hadRelevantKontexte ? newKontexte : currentKontexte;

        const creationResult: Result<void, DomainError> = await this.handleCreation(
            event,
            kontexteToUpsert,
            hadRelevantKontexte,
            registry,
        );
        if (!creationResult.ok) {
            return creationResult;
        }
        const deletionResult: Result<void, DomainError> = await this.handleDeletion(
            event,
            removedKontexte,
            currentKontexte,
            hadRelevantKontexte,
            registry,
        );
        if (!deletionResult.ok) {
            return deletionResult;
        }

        return Ok();
    }

    private async handleDeletion(
        event: PersonenkontextUpdatedEvent,
        removedKontexte: PersonenkontextEventKontextData[],
        currentKontexte: PersonenkontextEventKontextData[],
        hadRelevantKontexte: boolean,
        registry: SchulconnexPushRegistry<true>,
    ): Promise<Result<void, DomainError>> {
        for (const pk of removedKontexte) {
            // eslint-disable-next-line no-await-in-loop
            const result: Result<void, DomainError> = await this.adapter.deletePersonenkontext(
                registry,
                event.person.id,
                pk.id,
            );
            if (!result.ok) {
                return result;
            }
        }
        if (hadRelevantKontexte && currentKontexte.length === 0) {
            const result: Result<void, DomainError> = await this.adapter.deletePerson(registry, event.person.id);

            return result;
        }

        return Ok();
    }

    private async handleCreation(
        event: PersonenkontextUpdatedEvent,
        kontexteToUpsert: PersonenkontextEventKontextData[],
        hadRelevantKontexte: boolean,
        registry: SchulconnexPushRegistry<true>,
    ): Promise<Result<void, DomainError>> {
        if (kontexteToUpsert.length === 0) {
            return Ok();
        }
        const data: Result<PersonenInfoData, DomainError> = await this.loadPushData(event.person.id);
        if (!data.ok) {
            return data;
        }
        const kontexte: KontextWithOrgaAndRolle[] = [];
        for (const pk of kontexteToUpsert) {
            const kontext: Option<KontextWithOrgaAndRolle> = data.value.kontexteWithOrgaAndRolle.find(
                (candidate: KontextWithOrgaAndRolle) => candidate.personenkontext.id === pk.id,
            );
            if (!kontext) {
                return Err(new SchulconnexPushError(`Personenkontext ${pk.id} not found`));
            }
            kontexte.push(kontext);
        }

        if (!hadRelevantKontexte) {
            const result: Result<void, DomainError> = await this.adapter.upsertPerson(registry, data.value.person);
            if (!result.ok) {
                return result;
            }
        }
        for (const kontext of kontexte) {
            // eslint-disable-next-line no-await-in-loop
            const result: Result<void, DomainError> = await this.adapter.upsertPersonenkontext(
                registry,
                kontext,
                data.value.userLocks,
                data.value.email,
            );
            if (!result.ok) {
                return result;
            }
        }

        return Ok();
    }

    private hadRelevantKontexteBefore(
        removedKontexte: PersonenkontextEventKontextData[],
        currentKontexte: PersonenkontextEventKontextData[],
        newIds: Set<string>,
    ): boolean {
        const hadRelevantKontexte: boolean =
            removedKontexte.length > 0 ||
            currentKontexte.some((pk: PersonenkontextEventKontextData) => !newIds.has(pk.id));

        return hadRelevantKontexte;
    }

    private createRegistryKontextFilter(
        registry: SchulconnexPushRegistry<true>,
        rollen: Map<RolleID, Rolle<true>>,
    ): (pk: PersonenkontextEventKontextData) => boolean {
        return (pk: PersonenkontextEventKontextData): boolean =>
            pk.orgaTyp !== OrganisationsTyp.KLASSE &&
            rollen.get(pk.rolleId)?.serviceProviderIds.includes(registry.serviceProviderId) === true;
    }

    private async loadPushData(personId: PersonID): Promise<Result<PersonenInfoData, DomainError>> {
        const [person, kontexteWithOrgaAndRolle, userLocks, emails]: [
            Option<PersonenInfoData['person']>,
            PersonenInfoData['kontexteWithOrgaAndRolle'],
            PersonenInfoData['userLocks'],
            Result<Map<PersonID, PersonenInfoData['email']>, DomainError>,
        ] = await Promise.all([
            this.personRepo.findById(personId),
            this.personenkontextRepo.findByPersonWithOrgaAndRolle(personId),
            this.userLockRepo.findByPersonId(personId),
            this.emailResolverService.findEmailsBySpshPersons([personId]),
        ]);
        if (!person) {
            return Err(new SchulconnexPushError(`Person ${personId} not found`));
        }
        if (!emails.ok) {
            return emails;
        }

        return Ok({ person, kontexteWithOrgaAndRolle, userLocks, email: emails.value.get(personId) });
    }
}
