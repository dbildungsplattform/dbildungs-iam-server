import { Injectable } from '@nestjs/common';
import { PermittedOrgas } from '../../../authentication/domain/person-permissions.js';
import {
    DBiamPersonenkontextRepo,
    KontextWithOrgaAndRolle,
} from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenSystemRecht } from '../../../rolle/domain/systemrecht.js';
import { EmailRepo } from '../../../email/persistence/email.repo.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { UserLock } from '../../../keycloak-administration/domain/user-lock.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import { Rolle } from '../../../rolle/domain/rolle.js';
import { Person } from '../../../person/domain/person.js';
import { PersonID } from '../../../../shared/types/index.js';
import { SchulconnexRepo } from '../../persistence/schulconnex.repo.js';
import { IPersonPermissions } from '../../../../shared/permissions/person-permissions.interface.js';
import { EmailResolverService } from '../../../email-microservice/domain/email-resolver.service.js';
import { DomainError } from '../../../../shared/error/index.js';
import { Ok } from '../../../../shared/util/result.js';
import { type PersonenInfoData } from './personeninfo-data.js';

@Injectable()
export class PersonenInfoService {
    public constructor(
        private readonly personRepo: PersonRepository,
        private readonly schulconnexRepo: SchulconnexRepo,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly emailRepo: EmailRepo,
        private readonly userLockRepo: UserLockRepository,
        private readonly emailResolverService: EmailResolverService,
    ) {}

    public async findPersonsForPersonenInfoV1(
        permissions: IPersonPermissions,
        offset: number,
        limit: number,
    ): Promise<Result<PersonenInfoData[], DomainError>> {
        return this.findPersonenInfos(permissions, offset, limit);
    }

    public async findPersonsForPersonenInfoV2(
        permissions: IPersonPermissions,
        offset: number,
        limit: number,
    ): Promise<Result<PersonenInfoData[], DomainError>> {
        return this.findPersonenInfos(permissions, offset, limit);
    }

    private async findPersonenInfos(
        permissions: IPersonPermissions,
        offset: number,
        limit: number,
    ): Promise<Result<PersonenInfoData[], DomainError>> {
        // 1. Ermittle alle Knoten mit PERSONEN_LESEN-Recht
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.PERSONEN_LESEN],
            true,
        );

        // 2. Ermittle alle Rollen des Aufrufers mit PERSONEN_LESEN
        const aufruferKontexte: KontextWithOrgaAndRolle[] = await this.personenkontextRepo.findByPersonWithOrgaAndRolle(
            permissions.personFields.id,
        );
        const permittedServiceProviderIds: Set<string> = new Set<string>();

        for (const kontext of aufruferKontexte) {
            const rolle: Rolle<true> = kontext.rolle;
            const hasSystemrecht: boolean = rolle.systemrechte.some(
                (recht: RollenSystemRecht) => recht === RollenSystemRecht.PERSONEN_LESEN,
            );
            if (hasSystemrecht) {
                rolle.serviceProviderIds.forEach((sid: string) => permittedServiceProviderIds.add(sid));
            }
        }

        if (permittedServiceProviderIds.size === 0) {
            return Ok([]);
        }

        const [idsWithKontext, idsWithRollenerweiterung]: [PersonID[], PersonID[]] = await Promise.all([
            this.schulconnexRepo.findPersonIdsWithKontextAtServiceProvidersAndOptionallyOrganisations(
                permittedServiceProviderIds,
                permittedOrgas.all ? 'all' : new Set<string>(permittedOrgas.orgaIds),
            ),
            this.schulconnexRepo.findPersonIdsWithRollenerweiterungForServiceProviderAndOptionallyOrganisations(
                permittedServiceProviderIds,
                permittedOrgas.all ? 'all' : new Set<string>(permittedOrgas.orgaIds),
            ),
        ]);

        const personIds: PersonID[] = Array.from(new Set([...idsWithRollenerweiterung, ...idsWithKontext]))
            .sort((a: string, b: string) => a.localeCompare(b))
            .slice(offset, offset + limit);

        const emailsForPersonsPromise: Promise<Result<Map<PersonID, PersonenInfoData['email']>, DomainError>> =
            this.emailResolverService.shouldUseEmailMicroservice()
                ? this.emailResolverService.findEmailsBySpshPersons(personIds)
                : this.emailRepo.getEmailAddressAndStatusForPersonIds(personIds);

        const [persons, emailsForPersons, kontexteForPersons, userLocksForPersons]: [
            Person<true>[],
            Result<Map<PersonID, PersonenInfoData['email']>, DomainError>,
            Map<PersonID, KontextWithOrgaAndRolle[]>,
            Map<PersonID, UserLock[]>,
        ] = await Promise.all([
            this.personRepo.findByPersonIds(personIds),
            emailsForPersonsPromise,
            this.personenkontextRepo.findByPersonIdsAndServiceprovidersWithOrgaAndRolle(
                personIds,
                Array.from(permittedServiceProviderIds),
                permittedOrgas,
            ),
            this.userLockRepo.findByPersonIds(personIds),
        ]);

        if (!emailsForPersons.ok) {
            return emailsForPersons;
        }

        const emailMap: Map<PersonID, PersonenInfoData['email']> = emailsForPersons.value;
        const personenInfos: PersonenInfoData[] = persons.map((person: Person<true>) => {
            const personId: PersonID = person.id;
            const email: PersonenInfoData['email'] = emailMap.get(personId);
            const kontexteWithOrgaAndRolle: KontextWithOrgaAndRolle[] = kontexteForPersons.get(personId) ?? [];
            const userLocks: UserLock[] = userLocksForPersons.get(personId) ?? [];

            return { person, kontexteWithOrgaAndRolle, email, userLocks };
        });

        return Ok(personenInfos);
    }
}
