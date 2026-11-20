import { Injectable } from '@nestjs/common';

import {
    PersonenkontextUpdatedData,
    PersonenkontextUpdatedEvent,
} from '../../shared/events/personenkontext-updated.event.js';
import { EventHandler } from '../../core/eventbus/decorators/event-handler.decorator.js';
import { KeycloakUserService } from '../keycloak-administration/index.js';
import { RolleID } from '../../shared/types/aggregate-ids.types.js';
import { ServiceProvider } from '../service-provider/domain/service-provider.js';
import { RolleRepo } from '../rolle/repo/rolle.repo.js';
import { Rolle } from '../rolle/domain/rolle.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../shared/events/kafka-personenkontext-updated.event.js';
import { KafkaEventHandler } from '../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';

export type KeycloakRole = string;
@Injectable()
export class KeycloackServiceProviderHandler {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly KeycloackService: KeycloakUserService,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {}

    private async fetchFilteredRolesDifference(
        currentRoles: RolleID[],
        changingRole: RolleID[],
    ): Promise<(KeycloakRole | undefined)[]> {
        const rolleWhole: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(changingRole);
        const allRolleServiceProviders: ServiceProvider<true>[] = Array.from(rolleWhole.values()).flatMap(
            (rolle: Rolle<true>) => rolle.serviceProviderData ?? [],
        );

        const specificRolleWhole: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(currentRoles);
        const specificRolleServiceProviders: ServiceProvider<true>[] = Array.from(specificRolleWhole.values()).flatMap(
            (rolle: Rolle<true>) => rolle.serviceProviderData ?? [],
        );

        const allServiceProvidersNames: Set<KeycloakRole | undefined> = new Set(
            allRolleServiceProviders.map((element: ServiceProvider<true>) => element.keycloakGroup),
        );

        const specificServiceProvidersNames: Set<KeycloakRole | undefined> = new Set(
            specificRolleServiceProviders.map((element: ServiceProvider<true>) => element.keycloakGroup),
        );

        const updateRole: (KeycloakRole | undefined)[] = Array.from(allServiceProvidersNames).filter(
            (role: KeycloakRole | undefined) => !specificServiceProvidersNames.has(role),
        );

        return updateRole;
    }

    @KafkaEventHandler(KafkaPersonenkontextUpdatedEvent)
    @EventHandler(PersonenkontextUpdatedEvent)
    @EnsureRequestContext()
    public async handlePersonenkontextUpdatedEvent(
        event: PersonenkontextUpdatedEvent | KafkaPersonenkontextUpdatedEvent,
    ): Promise<void> {
        const {
            newKontexte,
            currentKontexte,
            removedKontexte,
            person,
        }: PersonenkontextUpdatedEvent | KafkaPersonenkontextUpdatedEvent = event;

        const newRolleIDs: RolleID[] = newKontexte.map((kontext: PersonenkontextUpdatedData) => kontext.rolleId);
        const deleteRolleIDs: RolleID[] = removedKontexte.map((kontext: PersonenkontextUpdatedData) => kontext.rolleId);
        const currentRolleIDs: RolleID[] = currentKontexte
            .map((kontext: PersonenkontextUpdatedData) => kontext.rolleId)
            .filter((id: RolleID) => id && !newRolleIDs.includes(id));
        if (person.keycloakUserId) {
            const promises: Promise<void>[] = [];

            if (newRolleIDs.length > 0 && currentKontexte.length) {
                for (const newRolle of newRolleIDs) {
                    if (!deleteRolleIDs.includes(newRolle)) {
                        promises.push(this.updateUserGroups(person.keycloakUserId, currentRolleIDs, newRolle));
                    }
                }
            }

            if (deleteRolleIDs.length > 0 && removedKontexte.length) {
                for (const deleteRolle of deleteRolleIDs) {
                    if (!newRolleIDs.includes(deleteRolle)) {
                        promises.push(this.updateUserGroups(person.keycloakUserId, currentRolleIDs, deleteRolle, true));
                    }
                }
            }

            await Promise.all(promises);
        }
    }

    private async updateUserGroups(
        userId: string,
        currentRolleIDs: RolleID[],
        rolle: RolleID,
        remove: boolean = false,
    ): Promise<void> {
        const roleNames: (string | undefined)[] = await this.fetchFilteredRolesDifference(currentRolleIDs, [rolle]);

        if (roleNames.length > 0) {
            if (remove) {
                await this.KeycloackService.removeRealmGroupsFromUser(userId, roleNames);
            } else {
                await this.KeycloackService.assignRealmGroupsToUser(userId, roleNames);
            }
        }
    }
}
