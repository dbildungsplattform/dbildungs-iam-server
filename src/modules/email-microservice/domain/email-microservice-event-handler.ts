import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable } from '@nestjs/common';
import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { KafkaPersonenkontextUpdatedEvent } from '../../../shared/events/kafka-personenkontext-updated.event.js';
import { PersonenkontextUpdatedEvent } from '../../../shared/events/personenkontext-updated.event.js';
import { EmailResolverService } from './email-resolver.service.js';
import { PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { KafkaPersonRenamedEvent } from '../../../shared/events/kafka-person-renamed-event.js';
import { PersonRenamedEvent } from '../../../shared/events/person-renamed-event.js';
import {
    DBiamPersonenkontextRepo,
    KontextWithOrgaAndRolle,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { uniq } from 'lodash-es';
import { KafkaPersonDeletedEvent } from '../../../shared/events/kafka-person-deleted.event.js';
import { PersonDeletedEvent } from '../../../shared/events/person-deleted.event.js';
import { KafkaPersonExternalSystemsSyncEvent } from '../../../shared/events/kafka-person-external-systems-sync.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { PersonID } from '../../../shared/types/index.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Person } from '../../person/domain/person.js';

@Injectable()
export class EmailMicroserviceEventHandler {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly rolleRepo: RolleRepo,
        private readonly emailResolverService: EmailResolverService,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly personRepository: PersonRepository,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {}

    @KafkaEventHandler(KafkaPersonenkontextUpdatedEvent)
    @EventHandler(PersonenkontextUpdatedEvent)
    @EnsureRequestContext()
    public async handlePersonenkontextUpdatedEvent(
        event: PersonenkontextUpdatedEvent | KafkaPersonenkontextUpdatedEvent,
    ): Promise<void> {
        this.logger.info(
            `Received PersonenkontextUpdatedEvent, personId:${event.person.id}, username:${event.person.username}, newPKs:${event.newKontexte.length}, removedPKs:${event.removedKontexte.length}`,
        );

        if (!this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Ignoring Event for personId:${event.person.id} because email microservice is disabled`);
            return;
        }
        if (!event.person.username) {
            throw new Error(`Person with id:${event.person.id} has no username, cannot resolve email.`);
        }

        //Current Kontexte can be used here because it includes also the new Kontexte
        let allKontexteForPerson: PersonenkontextEventKontextData[] = event.currentKontexte;

        if (event.removedKontexte) {
            allKontexteForPerson = allKontexteForPerson.filter((pk: PersonenkontextEventKontextData) =>
                event.removedKontexte.every((removedPK: PersonenkontextEventKontextData) => removedPK.id !== pk.id),
            );
        }

        const allRolleIds: string[] = allKontexteForPerson.map((k: PersonenkontextEventKontextData) => k.rolleId);
        const rollenMap: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(allRolleIds);

        const emailServiceProviderId: string | undefined = this.getEmailServiceProviderId(
            Array.from(rollenMap.values()),
        );

        if (!emailServiceProviderId) {
            // If only in the removedKontexte through this event is a serviceProviderId, set emails to suspended
            if (await this.existsEmailServiceProviderIdInRemovedKontexte(event.removedKontexte)) {
                await this.emailResolverService.setEmailsSuspendedForSpshPerson({ spshPersonId: event.person.id });
                return;
            } else {
                this.logger.debug(
                    `No email service provider found or removed for personId:${event.person.id}, skipping email resolution.`,
                );
                return;
            }
        }

        const uniqueKennungen: string[] = uniq(
            this.getKennungenWithEmailServiceProvider(
                allKontexteForPerson.map((k: PersonenkontextEventKontextData) => ({
                    orgaId: k.orgaId,
                    orgaKennung: k.orgaKennung,
                    rolleId: k.rolleId,
                })),
                rollenMap,
            ),
        );

        await this.emailResolverService.setEmailForSpshPerson({
            spshPersonId: event.person.id,
            spshUsername: event.person.username,
            kennungen: uniqueKennungen,
            firstName: event.person.vorname,
            lastName: event.person.familienname,
            spshServiceProviderId: emailServiceProviderId,
        });
    }

    @KafkaEventHandler(KafkaPersonRenamedEvent)
    @EventHandler(PersonRenamedEvent)
    @EnsureRequestContext()
    public async handlePersonRenamedEvent(event: PersonRenamedEvent | KafkaPersonRenamedEvent): Promise<void> {
        this.logger.info(
            `Received PersonRenamedEvent, personId:${event.personId}, username:${event.username}, oldUsername:${event.oldUsername}`,
        );

        if (!this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Ignoring Event for personId:${event.personId} because email microservice is disabled`);
            return;
        }
        if (!event.username) {
            throw new Error(`Person with id:${event.personId} has no username, cannot resolve email.`);
        }

        const allKontexteForPerson: KontextWithOrgaAndRolle[] =
            await this.personenkontextRepo.findByPersonWithOrgaAndRolle(event.personId);

        const allRolleIds: string[] = allKontexteForPerson.map((k: KontextWithOrgaAndRolle) => k.rolle.id);
        const rollenMap: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(allRolleIds);

        const emailServiceProviderId: string | undefined = this.getEmailServiceProviderId(
            Array.from(rollenMap.values()),
        );

        if (!emailServiceProviderId) {
            this.logger.info(
                `No email service provider found for personId:${event.personId}, skipping email resolution.`,
            );
            return;
        }

        const uniqueKennungen: string[] = uniq(
            this.getKennungenWithEmailServiceProvider(
                allKontexteForPerson.map((k: KontextWithOrgaAndRolle) => ({
                    orgaId: k.organisation.id,
                    orgaKennung: k.organisation.kennung,
                    rolleId: k.rolle.id,
                })),
                rollenMap,
            ),
        );

        await this.emailResolverService.setEmailForSpshPerson({
            spshPersonId: event.personId,
            spshUsername: event.username,
            kennungen: uniqueKennungen,
            firstName: event.vorname,
            lastName: event.familienname,
            spshServiceProviderId: emailServiceProviderId,
        });
    }

    @KafkaEventHandler(KafkaPersonDeletedEvent)
    @EventHandler(PersonDeletedEvent)
    @EnsureRequestContext()
    public async handlePersonDeletedEvent(event: PersonDeletedEvent | KafkaPersonDeletedEvent): Promise<void> {
        this.logger.info(
            `Received PersonenkontextDeletedEvent, personId:${event.personId}, username:${event.username}`,
        );
        if (!this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Ignoring Event for personId:${event.personId} because email microservice is disabled`);
            return;
        }
        await this.emailResolverService.deleteEmailsForSpshPerson({ spshPersonId: event.personId });
    }

    @KafkaEventHandler(KafkaPersonExternalSystemsSyncEvent)
    @EventHandler(PersonExternalSystemsSyncEvent)
    @EnsureRequestContext()
    public async handlePersonExternalSystemsSyncEvent(
        event: PersonExternalSystemsSyncEvent | KafkaPersonExternalSystemsSyncEvent,
    ): Promise<void> {
        const personId: PersonID = event.personId;
        this.logger.info(`Received PersonExternalSystemsSyncEvent, personId:${personId}`);
        if (!this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Ignoring Event for personId:${personId} because email microservice is disabled`);
            return;
        }

        const allKontexteForPerson: KontextWithOrgaAndRolle[] =
            await this.personenkontextRepo.findByPersonWithOrgaAndRolle(event.personId);

        const allRolleIds: string[] = allKontexteForPerson.map((k: KontextWithOrgaAndRolle) => k.rolle.id);
        const rollenMap: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(allRolleIds);

        const emailServiceProviderId: string | undefined = this.getEmailServiceProviderId(
            Array.from(rollenMap.values()),
        );

        if (emailServiceProviderId) {
            this.logger.info(
                `Found email service provider for personId:${personId}, setting emails accordingly in email microservice.`,
            );
            const person: Option<Person<true>> = await this.personRepository.findById(personId);
            if (!person) {
                this.logger.error(`Person with id:${personId} not found. Therefor aborting setEmailForSpshPerson`);
                return;
            }
            if (!person.username) {
                this.logger.error(
                    `Person with id:${personId} found, but has no username. Therefor aborting setEmailForSpshPerson`,
                );
                return;
            }
            const uniqueKennungen: string[] = uniq(
                this.getKennungenWithEmailServiceProvider(
                    allKontexteForPerson.map((k: KontextWithOrgaAndRolle) => ({
                        orgaId: k.organisation.id,
                        orgaKennung: k.organisation.kennung,
                        rolleId: k.rolle.id,
                    })),
                    rollenMap,
                ),
            );

            await this.emailResolverService.setEmailForSpshPerson({
                spshPersonId: event.personId,
                spshUsername: person.username,
                kennungen: uniqueKennungen,
                firstName: person.vorname,
                lastName: person.familienname,
                spshServiceProviderId: emailServiceProviderId,
            });
        } else {
            this.logger.info(
                `No email service provider found for personId:${personId}, suspending emails in email microservice if there are any.`,
            );
            await this.emailResolverService.setEmailsSuspendedForSpshPerson({ spshPersonId: personId });
        }
    }

    private getEmailServiceProviderId(rollen: Rolle<true>[]): string | undefined {
        const spshServiceProviderId: string | undefined = rollen
            .flatMap((rolle: Rolle<true>) => rolle.serviceProviderData)
            .find(
                (serviceProvider: ServiceProvider<true>) =>
                    serviceProvider.externalSystem === ServiceProviderSystem.EMAIL,
            )?.id;

        return spshServiceProviderId;
    }

    private getKennungenWithEmailServiceProvider(
        kontexte: { orgaId: string; orgaKennung: string | undefined; rolleId: string }[],
        rollenMap: Map<string, Rolle<true>>,
    ): string[] {
        return kontexte
            .filter((kontext: { orgaId: string; orgaKennung: string | undefined; rolleId: string }) =>
                rollenMap
                    .get(kontext.rolleId)
                    ?.serviceProviderData.some(
                        (sp: ServiceProvider<true>) => sp.externalSystem === ServiceProviderSystem.EMAIL,
                    ),
            )
            .map((kontext: { orgaId: string; orgaKennung: string | undefined; rolleId: string }) => kontext.orgaKennung)
            .filter((kennung: string | undefined): kennung is string => !!kennung);
    }

    private async existsEmailServiceProviderIdInRemovedKontexte(
        removedKontexte: PersonenkontextEventKontextData[],
    ): Promise<boolean> {
        const rolleIds: string[] = removedKontexte.map((k: PersonenkontextEventKontextData) => k.rolleId);
        const rollenMap: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(rolleIds);
        const emailServiceProviderId: string | undefined = this.getEmailServiceProviderId(
            Array.from(rollenMap.values()),
        );
        return Boolean(emailServiceProviderId);
    }
}
