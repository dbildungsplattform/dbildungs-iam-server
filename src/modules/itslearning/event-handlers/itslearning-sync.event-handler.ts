import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ItsLearningConfig, ServerConfig } from '../../../shared/config/index.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { OrganisationID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import {
    DBiamPersonenkontextRepo,
    type ErweiterterServiceProviderForPK,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import {
    ItslearningMembershipAdapter,
    SetMembershipParams,
    SetMembershipsResult,
} from '../adapter/domain/itslearning-membership.adapter.js';
import { ItslearningPersonAdapter } from '../adapter/domain/itslearning-person.adapter.js';
import { determineHighestRollenart, rollenartToIMSESInstitutionRole } from '../adapter/domain/role-utils.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { KafkaPersonExternalSystemsSyncEvent } from '../../../shared/events/kafka-person-external-systems-sync.event.js';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { EntityManager } from '@mikro-orm/core';
@Injectable()
export class ItsLearningSyncEventHandler {
    public ENABLED: boolean;

    public constructor(
        private readonly logger: ClassLogger,

        private readonly itslearningPersonAdapter: ItslearningPersonAdapter,
        private readonly itslearningMembershipAdapter: ItslearningMembershipAdapter,

        private readonly personRepo: PersonRepository,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepo: OrganisationRepository,
        private readonly emailResolverService: EmailResolverService,
        configService: ConfigService<ServerConfig>,

        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {
        const itsLearningConfig: ItsLearningConfig = configService.getOrThrow<ItsLearningConfig>('ITSLEARNING');

        this.ENABLED = itsLearningConfig.ENABLED;
    }

    @KafkaEventHandler(KafkaPersonExternalSystemsSyncEvent)
    @EventHandler(PersonExternalSystemsSyncEvent)
    @EnsureRequestContext()
    public async personExternalSystemSyncEventHandler(event: PersonExternalSystemsSyncEvent): Promise<void> {
        this.logger.info(`[EventID: ${event.eventID}] Received PersonExternalSystemsSyncEvent, ${event.personId}`);

        if (!this.ENABLED) {
            return this.logger.info(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
        }

        // Retrieve the person from the DB
        const person: Option<Person<true>> = await this.personRepo.findById(event.personId);
        if (!person) {
            return this.logger.error(
                `[EventID: ${event.eventID}] Person with ID ${event.personId} could not be found!`,
            );
        }

        // Check if person has a username
        if (!person.username) {
            return this.logger.error(`[EventID: ${event.eventID}] Person with ID ${event.personId} has no username!`);
        }

        // Get all personenkontexte for this person
        const kontexte: Personenkontext<true>[] = await this.personenkontextRepo.findByPerson(event.personId);

        // Find all rollen and organisations
        const rollenIDs: RolleID[] = [...new Set(kontexte.map((pk: Personenkontext<true>) => pk.rolleId))];
        const organisationIDs: OrganisationID[] = [
            ...new Set(kontexte.map((pk: Personenkontext<true>) => pk.organisationId)),
        ];
        const [rollen, organisations]: [Map<RolleID, Rolle<true>>, Map<OrganisationID, Organisation<true>>] =
            await Promise.all([this.rolleRepo.findByIds(rollenIDs), this.organisationRepo.findByIds(organisationIDs)]);

        // Rollen that have itslearning rolle-wide. Kontexte of these rollen are relevant without any extension.
        const itslearningRollenIDs: Set<RolleID> = new Set(
            Array.from(rollen.values())
                .filter((rolle: Rolle<true>) =>
                    rolle.serviceProviderData.some(
                        (sp: ServiceProvider<true>) => sp.externalSystem === ServiceProviderSystem.ITSLEARNING,
                    ),
                )
                .map((rolle: Rolle<true>) => rolle.id),
        );

        // Kontexte that receive itslearning through a school-specific Rollenerweiterung
        const erweiterteSPs: ErweiterterServiceProviderForPK[] =
            await this.personenkontextRepo.findErweiterteSPByPersonId(event.personId);
        const kontextIdsWithItslearningErweiterung: Set<string> = new Set(
            erweiterteSPs
                .filter(
                    (erweiterterSP: ErweiterterServiceProviderForPK) =>
                        erweiterterSP.serviceProvider.externalSystem === ServiceProviderSystem.ITSLEARNING,
                )
                .map((erweiterterSP: ErweiterterServiceProviderForPK) => erweiterterSP.personenkontext.id),
        );

        const hasItslearning = (pk: Personenkontext<true>): boolean =>
            itslearningRollenIDs.has(pk.rolleId) || kontextIdsWithItslearningErweiterung.has(pk.id);

        // Classes are enabled through their parent school. The school is not necessarily one of the person's own organisations.
        const parentSchoolIDs: OrganisationID[] = [
            ...new Set(
                Array.from(organisations.values())
                    .filter((organisation: Organisation<true>) => organisation.typ === OrganisationsTyp.KLASSE)
                    .map((organisation: Organisation<true>) => organisation.administriertVon)
                    .filter((id?: OrganisationID): id is OrganisationID => !!id && !organisations.has(id)),
            ),
        ];
        const parentSchools: Map<OrganisationID, Organisation<true>> = parentSchoolIDs.length > 0
            ? await this.organisationRepo.findByIds(parentSchoolIDs)
            : new Map<OrganisationID, Organisation<true>>();
        const organisationsWithParents: Map<OrganisationID, Organisation<true>> = new Map([
            ...organisations,
            ...parentSchools,
        ]);

        // Remove all organisations that do not have itslearning
        for (const [orgaId, organisation] of organisations.entries()) {
            if (organisation.typ === OrganisationsTyp.SCHULE) {
                // Only keep schools, that are enabled for itslearning
                if (!organisation.itslearningEnabled) {
                    organisations.delete(orgaId);
                }
            } else if (organisation.typ === OrganisationsTyp.KLASSE) {
                // Only keep classes, whose schools are enabled for itslearning
                const parentItslearningEnabled: boolean = !!(
                    organisation.administriertVon &&
                    organisationsWithParents.get(organisation.administriertVon)?.itslearningEnabled
                );

                if (!parentItslearningEnabled) {
                    organisations.delete(orgaId);
                }
            } else {
                // We only care about schools and classes
                organisations.delete(orgaId);
            }
        }

        // Filter kontexte we care about
        const relevantKontexte: Personenkontext<true>[] = kontexte.filter(
            (pk: Personenkontext<true>) => hasItslearning(pk) && organisations.has(pk.organisationId),
        );

        // Check if the person has at least one personenkontext with the itslearning-system
        if (relevantKontexte.length > 0) {
            const targetRole: RollenArt = determineHighestRollenart(
                kontexte
                    .filter((pk: Personenkontext<true>) => hasItslearning(pk))
                    .map((pk: Personenkontext<true>) => rollen.get(pk.rolleId)!.rollenart),
            );

            const emailAddress: string | undefined =
                await this.emailResolverService.getPrimaryActiveEmailForPerson(person);

            // Create or update the person in itslearning
            const creationResult: Result<void, DomainError> = await this.itslearningPersonAdapter.createOrUpdatePerson(
                {
                    id: person.id,
                    firstName: person.vorname,
                    lastName: person.familienname,
                    username: person.username,
                    institutionRoleType: rollenartToIMSESInstitutionRole(targetRole),
                    email: emailAddress,
                },
                `${event.eventID}-SYNC-PERSON`,
            );

            if (!creationResult.ok) {
                return this.logger.logUnknownAsError(
                    `[EventID: ${event.eventID}] Could not create/update person with ID ${person.id} in itslearning!`,
                    creationResult.error,
                );
            }

            this.logger.info(`[EventID: ${event.eventID}] Updated person with ID ${person.id} in itslearning!`);

            // Set the memberships
            const memberships: SetMembershipParams[] = relevantKontexte.map((pk: Personenkontext<true>) => ({
                organisationId: pk.organisationId,

                // We know the map will contain the rolle, 'relevantKontexte' was already filtered
                role: rollen.get(pk.rolleId)!.rollenart,
            }));

            const setMembershipsResult: Result<SetMembershipsResult, DomainError> =
                await this.itslearningMembershipAdapter.setMemberships(
                    person.id,
                    memberships,
                    `${event.eventID}-SYNC-PERSON-MEMBERSHIPS`,
                );

            if (!setMembershipsResult.ok) {
                return this.logger.error(
                    `[EventID: ${event.eventID}] Could not delete person with ID ${person.id} from itslearning!`,
                );
            }

            this.logger.info(
                `[EventID: ${event.eventID}] Created/Updated ${setMembershipsResult.value.updated} and deleted ${setMembershipsResult.value.deleted} memberships for person with ID ${person.id} to itslearning!`,
            );
        } else {
            this.logger.info(
                `[EventID: ${event.eventID}] Deleting person with ID ${person.id} from itslearning (if they exist), because they have no relevant personenkontexte!`,
            );

            // We don't have any relevant personenkontexte for this person, so we delete it
            const deleteError: Option<DomainError> = await this.itslearningPersonAdapter.deletePerson(
                person.id,
                `${event.eventID}-DELETE`,
            );

            if (deleteError) {
                return this.logger.error(
                    `[EventID: ${event.eventID}] Could not delete person with ID ${person.id} from itslearning!`,
                );
            }
        }
    }
}
