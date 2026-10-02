import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { inspect } from 'util';
import { OrganisationsTyp } from '../../../modules/organisation/domain/organisation.enums.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { EscalatedPersonPermissionsFactory } from '../../../modules/permission/escalated-person-permissions.factory.js';
import { EscalatedPersonPermissions } from '../../../modules/permission/escalated-person-permissions.js';
import { Person } from '../../../modules/person/domain/person.js';
import { PersonRepository } from '../../../modules/person/persistence/person.repository.js';
import { DBiamPersonenkontextRepo } from '../../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { RollenSystemRechtEnum } from '../../../modules/rolle/domain/systemrecht.js';
import { ServiceProviderSystem } from '../../../modules/service-provider/domain/service-provider.enum.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { KafkaEmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/kafka-email-microservice-address-changed.event.js';
import { KafkaOrganisationDeletedEvent } from '../../../shared/events/kafka-organisation-deleted.event.js';
import { KafkaPersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/kafka-person-deleted-after-deadline-exceeded.event.js';
import { KafkaPersonDeletedEvent } from '../../../shared/events/kafka-person-deleted.event.js';
import { KafkaPersonRenamedEvent } from '../../../shared/events/kafka-person-renamed-event.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../../shared/events/kafka-personenkontext-updated.event.js';
import { KafkaLdapPersonEntryRenamedEvent } from '../../../shared/events/ldap/kafka-ldap-person-entry-renamed.event.js';
import { LdapPersonEntryRenamedEvent } from '../../../shared/events/ldap/ldap-person-entry-renamed.event.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { PersonDeletedAfterDeadlineExceededEvent } from '../../../shared/events/person-deleted-after-deadline-exceeded.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import {
    PersonenkontextEventKontextData,
    PersonenkontextEventPersonData,
} from '../../../shared/events/personenkontext-event.types.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { OrganisationID, PersonID, PersonUsername } from '../../../shared/types/aggregate-ids.types.js';
import { Ok } from '../../../shared/util/result.js';
import { EventHandler } from '../../eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../eventbus/decorators/kafka-event-handler.decorator.js';
import { EventRoutingLegacyKafkaService } from '../../eventbus/services/event-routing-legacy-kafka.service.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { AbstractLdapEventHandler } from './abstract-ldap-event-handler.js';
import { LdapAdapter, PersonData } from '../adapter/domain/ldap.adapter.js';
import { LdapEventAccumulatedFailuresError } from './error/ldap-event-accumulated-failures.error.js';
import { LdapEventOrganisationWithoutKennungError } from './error/ldap-event-organisation-without-kennung.error.js';
import { LdapEventInvalidUemLdapOuError } from './error/ldap-event-invalid-uem-ldap-ou.error.js';

@Injectable()
export class LdapEventHandler extends AbstractLdapEventHandler {
    public constructor(
        logger: ClassLogger,
        dbiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        rolleRepo: RolleRepo,
        organisationRepository: OrganisationRepository,
        private readonly ldapClientAdapter: LdapAdapter,
        private readonly personRepo: PersonRepository,
        private readonly escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
        private readonly eventService: EventRoutingLegacyKafkaService,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {
        super(logger, organisationRepository, dbiamPersonenkontextRepo, rolleRepo);
    }

    @KafkaEventHandler(KafkaPersonDeletedEvent)
    @EventHandler(PersonDeletedEvent)
    @EnsureRequestContext()
    public async handlePersonDeletedEvent(
        event: PersonDeletedEvent | KafkaPersonDeletedEvent,
    ): Promise<Result<unknown>> {
        this.logger.info(
            `Received PersonenkontextDeletedEvent, personId:${event.personId}, username:${event.username}`,
        );
        const deletionResult: Result<PersonID | null> = await this.ldapClientAdapter.deleteLehrerByUsername(
            event.username,
        );
        if (!deletionResult.ok) {
            this.logger.error(deletionResult.error.message);
        }

        return deletionResult;
    }

    @EventHandler(PersonDeletedAfterDeadlineExceededEvent)
    @KafkaEventHandler(KafkaPersonDeletedAfterDeadlineExceededEvent)
    @EnsureRequestContext()
    public async handlePersonDeletedAfterDeadlineExceededEvent(
        event: PersonDeletedAfterDeadlineExceededEvent | KafkaPersonDeletedAfterDeadlineExceededEvent,
    ): Promise<Result<unknown>> {
        this.logger.info(
            `Received PersonDeletedAfterDeadlineExceededEvent, personId:${event.personId}, username:${event.username}, oxUserId:${event.oxUserId}`,
        );
        const deletionResult: Result<PersonID | null> = await this.ldapClientAdapter.deleteLehrerByUsername(
            event.username,
        );
        if (!deletionResult.ok) {
            this.logger.error(deletionResult.error.message);
        }

        return deletionResult;
    }

    @KafkaEventHandler(KafkaEmailMicroserviceAddressChangedEvent)
    @EventHandler(EmailMicroserviceAddressChangedEvent)
    @EnsureRequestContext()
    public async microserviceEmailChangedEventHandler(event: EmailMicroserviceAddressChangedEvent): Promise<void> {
        const permissions: EscalatedPersonPermissions = this.escalatedPersonPermissionsFactory.createNew([
            { orgaId: 'ROOT', systemrechte: [RollenSystemRechtEnum.PERSONEN_LESEN] },
        ]);
        const hasAnyReadableKontexts: Result<boolean, DomainError> =
            await this.dbiamPersonenkontextRepo.hasPersonAnyReadableKontext(event.personId, permissions);
        const person: Option<Person<true>> = await this.personRepo.findById(event.personId);

        if (!person || !person.username) {
            this.logger.warning(
                `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, but person not found or has no username. Skipping LDAP update.`,
            );
            return;
        }
        if (!event.newPrimaryAddress) {
            this.logger.error(
                `Received EmailMicroserviceAddressChangedEvent with empty newPrimaryAddress for personId:${event.personId}, username:${person.username}. Skipping LDAP update.`,
            );
            return;
        }

        if (!hasAnyReadableKontexts.ok || !hasAnyReadableKontexts.value) {
            this.logger.error(
                `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, username:${person.username}, but failed to check kontexts. Skipping LDAP update.`,
            );
            return;
        }

        const uemLdapOuResult: Result<string> = await this.findUemLdapOuForPersonId(event.personId);
        if (!uemLdapOuResult.ok) {
            this.logger.error(`Failed to resolve UEM LDAP OU for personId:${event.personId}. Skipping LDAP update.`);
            return;
        }

        this.logger.info(
            `Received EmailMicroserviceAddressChangedEvent for personId:${event.personId}, username:${person.username}, updating LDAP primary email address.`,
        );
        await this.ldapClientAdapter.changeEmailAddressByPersonId(
            event.personId,
            person.username,
            event.newPrimaryAddress,
            undefined,
        );
        return;
    }

    @KafkaEventHandler(KafkaPersonRenamedEvent)
    @EventHandler(PersonRenamedEvent)
    @EnsureRequestContext()
    public async personRenamedEventHandler(
        event: PersonRenamedEvent | KafkaPersonRenamedEvent,
    ): Promise<Result<unknown>> {
        this.logger.info(
            `Received PersonRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${event.oldUsername}`,
        );
        const modifyResult: Result<PersonUsername> = await this.ldapClientAdapter.modifyPersonAttributes(
            event.oldUsername,
            event.vorname,
            event.familienname,
            event.username,
        );
        if (!modifyResult.ok) {
            this.logger.error(modifyResult.error.message);
            return modifyResult;
        }

        this.logger.info(`Successfully modified person attributes in LDAP for personId:${event.personId}`);
        this.eventService.publish(
            LdapPersonEntryRenamedEvent.fromPersonRenamedEvent(event),
            KafkaLdapPersonEntryRenamedEvent.fromPersonRenamedEvent(event),
        );

        return modifyResult;
    }

    @KafkaEventHandler(KafkaPersonenkontextUpdatedEvent)
    @EventHandler(PersonenkontextUpdatedEvent)
    @EnsureRequestContext()
    public async handlePersonenkontextUpdatedEvent(
        event: PersonenkontextUpdatedEvent | KafkaPersonenkontextUpdatedEvent,
    ): Promise<Result<unknown>> {
        this.logger.info(
            `Received PersonenkontextUpdatedEvent, personId:${event.person.id}, username:${event.person.username}, newPKs:${event.newKontexte.length}, removedPKs:${event.removedKontexte.length}`,
        );

        const removeResults: PromiseSettledResult<Result<boolean>>[] = await Promise.allSettled(
            event.removedKontexte
                .filter(
                    (pk: PersonenkontextEventKontextData) =>
                        pk.serviceProviderExternalSystems.includes(ServiceProviderSystem.UEM) &&
                        !this.hatZuordnungZuOrganisationNachLoeschen(event, pk),
                )
                .map((pk: PersonenkontextEventKontextData) =>
                    this.removePersonFromLdapGroup(event.person.username!, pk),
                ),
        );

        const newKontexteResults: PromiseSettledResult<Result<PersonData>>[] = await Promise.allSettled(
            event.newKontexte
                .filter((pk: PersonenkontextEventKontextData) =>
                    pk.serviceProviderExternalSystems.includes(ServiceProviderSystem.UEM),
                )
                .map((pk: PersonenkontextEventKontextData) => this.createLehrerInLdap(event.person, pk)),
        );

        const failureReasons: string[] = this.collectFailureReasons([...removeResults, ...newKontexteResults]);
        if (failureReasons.length > 0) {
            return { ok: false, error: new LdapEventAccumulatedFailuresError(failureReasons) };
        }

        return { ok: true, value: null };
    }

    private async removePersonFromLdapGroup(
        username: PersonUsername,
        pk: PersonenkontextEventKontextData,
    ): Promise<Result<boolean>> {
        if (!pk.orgaKennung) {
            throw new LdapEventOrganisationWithoutKennungError();
        }

        const uemLdapOu: Result<string> = await this.resolveUemLdapOuOrThrow(pk.orgaId);
        if (!uemLdapOu.ok) {
            this.logger.error(
                `LdapClientService removePersonFromGroup NOT called, because organisation:${pk.orgaId} has no valid uemLdapOu`,
            );
            throw new LdapEventInvalidUemLdapOuError();
        }

        this.logger.info(`Call LdapClientService because person has UEM service provider, pkId: ${pk.id}`);
        try {
            const removeResult: Result<boolean> =
                await this.ldapClientAdapter.removePersonFromGroupByUsernameAndKennung(
                    username,
                    pk.orgaKennung,
                    uemLdapOu.value,
                );
            if (!removeResult.ok) {
                this.logger.error(removeResult.error.message);
            }
            return removeResult;
        } catch (error: unknown) {
            this.logger.error(
                `Error in removePersonFromGroup: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        }
    }

    private async createLehrerInLdap(
        person: PersonenkontextEventPersonData,
        pk: PersonenkontextEventKontextData,
    ): Promise<Result<PersonData>> {
        this.logger.info(`Call LdapClientService because person has UEM service provider`);
        if (!pk.orgaKennung) {
            throw new LdapEventOrganisationWithoutKennungError();
        }

        const uemLdapOu: Result<string> = await this.resolveUemLdapOuOrThrow(pk.orgaId);
        if (!uemLdapOu.ok) {
            this.logger.error(
                `LdapClientService createLehrer NOT called, because organisation:${pk.orgaId} has no valid uemLdapOu`,
            );
            throw new LdapEventInvalidUemLdapOuError();
        }

        try {
            const creationResult: Result<PersonData> = await this.ldapClientAdapter.createLehrer(
                person,
                uemLdapOu.value,
                pk.orgaKennung,
            );
            if (!creationResult.ok) {
                this.logger.error(creationResult.error.message);
                return creationResult;
            }
            await this.persistLdapEntryUuid(person, creationResult.value);
            return creationResult;
        } catch (error: unknown) {
            this.logger.error(`Error in createLehrer: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }

    private async persistLdapEntryUuid(person: PersonenkontextEventPersonData, creation: PersonData): Promise<void> {
        const persistedPerson: Option<Person<true>> = await this.personRepo.findById(person.id);
        if (!persistedPerson) {
            this.logger.error(
                `LdapClientService createLehrer could not find person with id:${person.id}, ref:${person.username}`,
            );
            return;
        }
        if (creation.ldapEntryUUID) {
            persistedPerson.externalIds.LDAP = creation.ldapEntryUUID;
            await this.personRepo.save(persistedPerson);
        }
    }

    @KafkaEventHandler(KafkaOrganisationDeletedEvent)
    @EventHandler(OrganisationDeletedEvent)
    public async handleOrganisationDeletedEvent(event: OrganisationDeletedEvent): Promise<Result<unknown>> {
        this.logger.info(
            `Received OrganisationDeletedEvent, organisationId:${event.organisationId}, name:${event.name}, kennung:${event.kennung}, typ:${event.typ}`,
        );
        if (event?.typ !== OrganisationsTyp.SCHULE || !event.kennung) {
            this.logger.info(
                `Cannot delete organisation, since typ is not ${OrganisationsTyp.SCHULE} or kennung is UNDEFINED, organisationId:${event.organisationId}, kennung:${event.kennung}, typ:${event.typ}`,
            );
            return Ok(undefined);
        }
        const organisationExistsResult: Result<boolean> = await this.ldapClientAdapter.organisationExists(
            event.kennung,
        );

        if (!organisationExistsResult.ok) {
            return organisationExistsResult;
        }

        if (organisationExistsResult.value) {
            return this.ldapClientAdapter.deleteOrganisation(event.kennung);
        }

        return Ok(undefined);
    }

    public hatZuordnungZuOrganisationNachLoeschen(
        personenkontextUpdatedEvent: PersonenkontextUpdatedEvent,
        personenkontextEventKontextData: PersonenkontextEventKontextData,
    ): boolean {
        const orgaId: OrganisationID = personenkontextEventKontextData.orgaId;
        // Only a remaining kontext that still carries UEM keeps the LDAP group membership justified.
        const currentOrgaIdsWithUem: OrganisationID[] = personenkontextUpdatedEvent.currentKontexte
            .filter((pk: PersonenkontextEventKontextData) =>
                pk.serviceProviderExternalSystems.includes(ServiceProviderSystem.UEM),
            )
            .map((pk: PersonenkontextEventKontextData) => pk.orgaId);

        return currentOrgaIdsWithUem.includes(orgaId);
    }

    private collectFailureReasons(results: PromiseSettledResult<Result<unknown>>[]): string[] {
        return results.reduce((acc: string[], result: PromiseSettledResult<Result<unknown, Error>>) => {
            if (result.status === 'rejected') {
                acc.push(inspect(result.reason));
            } else if (!result.value.ok) {
                acc.push(inspect(result.value.error));
            }
            return acc;
        }, []);
    }
}
