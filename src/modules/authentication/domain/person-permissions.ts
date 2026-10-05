import { intersection, uniq } from 'lodash-es';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, PersonID, RolleID } from '../../../shared/types/index.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Person } from '../../person/domain/person.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';

export type PersonFields = Pick<
    Person<true>,
    'id' | 'keycloakUserId' | 'vorname' | 'familienname' | 'username' | 'updatedAt'
>;
type PersonKontextFields = Pick<Personenkontext<true>, 'rolleId' | 'organisationId'>;
type RolleFields = Pick<Rolle<true>, 'systemrechte' | 'serviceProviderIds'>;
export type PersonenkontextRolleWithOrganisation = {
    organisation: Organisation<true>;
    rolle: RolleFields;
};

export type PermittedOrgas = { all: true } | { all: false; orgaIds: OrganisationID[] };

export function intersectPermittedAndRequestedOrgas(
    permittedOrgas: PermittedOrgas,
    requestedOrgaIds: OrganisationID[],
): OrganisationID[] {
    return permittedOrgas.all ? requestedOrgaIds : intersection(permittedOrgas.orgaIds, requestedOrgaIds);
}

export function isPersonPermissions(obj: unknown): obj is PersonPermissions {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'cachedPersonenkontextsFields' in obj &&
        'cachedPersonFields' in obj &&
        'cachedRollenFields' in obj
    );
}

export class PersonPermissions implements IPersonPermissions {
    public readonly id: string;

    private cachedPersonenkontextsFields?: PersonKontextFields[];

    private readonly cachedPersonFields: PersonFields;

    private cachedRollenFields?: PersonenkontextRolleWithOrganisation[];

    public constructor(
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly organisationRepo: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
        person: Person<true>,
    ) {
        this.id = person.id;
        this.cachedPersonFields = {
            id: person.id,
            keycloakUserId: person.keycloakUserId,
            vorname: person.vorname,
            familienname: person.familienname,
            username: person.username,
            updatedAt: person.updatedAt,
        };
    }

    public async getRoleIds(): Promise<RolleID[]> {
        const personKontextFields: PersonKontextFields[] = await this.getPersonenkontextsFields();

        return personKontextFields.map((personenkontextFields: PersonKontextFields) => {
            return personenkontextFields.rolleId;
        });
    }

    public async getOrgIdsWithSystemrecht(
        systemrechte: RollenSystemRecht[],
        withChildren: boolean = false,
        matchAll: boolean = true,
    ): Promise<PermittedOrgas> {
        if (await this.hasSystemrechteAtRootOrganisation(systemrechte, matchAll)) {
            return { all: true };
        }
        const organisationIDs: Set<OrganisationID> = new Set();

        const personKontextFields: PersonKontextFields[] = await this.getPersonenkontextsFields();
        const rollen: Map<RolleID, Rolle<true>> = await this.rolleRepo.findByIds(
            personKontextFields.map((pk: PersonKontextFields) => pk.rolleId),
        );

        for (const pk of personKontextFields) {
            const rolle: Rolle<true> | undefined = rollen.get(pk.rolleId);
            if (
                rolle &&
                (matchAll
                    ? systemrechte.every((r: RollenSystemRecht) => rolle.hasSystemRecht(r))
                    : systemrechte.some((r: RollenSystemRecht) => rolle.hasSystemRecht(r)))
            ) {
                organisationIDs.add(pk.organisationId);
            }
        }

        if (withChildren) {
            const childOrgas: Organisation<true>[] = await this.organisationRepo.findChildOrgasForIds(
                Array.from(organisationIDs),
            );

            childOrgas.forEach((orga: Organisation<true>) => organisationIDs.add(orga.id));
        }

        return {
            all: false,
            orgaIds: Array.from(organisationIDs),
        };
    }

    public async hasSystemrechteAtOrganisation(
        organisationId: OrganisationID,
        systemrechte: RollenSystemRecht[],
        matchAll: boolean = true,
    ): Promise<boolean> {
        const checks: Promise<boolean>[] = systemrechte.map(
            (systemrecht: RollenSystemRecht): Promise<boolean> =>
                this.hasSystemrechtAtOrganisation(organisationId, systemrecht),
        );
        const results: boolean[] = await Promise.all(checks);

        return matchAll
            ? results.every((result: boolean): boolean => result)
            : results.some((result: boolean): boolean => result);
    }

    public async hasSystemrechteAtRootOrganisation(
        systemrechte: RollenSystemRecht[],
        matchAll: boolean = true,
    ): Promise<boolean> {
        return this.hasSystemrechteAtOrganisation(this.organisationRepo.ROOT_ORGANISATION_ID, systemrechte, matchAll);
    }

    public async hasSystemrechtAtOrganisation(
        organisationId: OrganisationID,
        systemrecht: RollenSystemRecht,
    ): Promise<boolean> {
        return this.personenkontextRepo.hasSystemrechtAtOrganisation(this.id, organisationId, systemrecht);
    }

    public async canModifyPerson(personId: PersonID): Promise<boolean> {
        const hasModifyRechtAtRoot: boolean = await this.hasSystemrechteAtRootOrganisation([
            RollenSystemRecht.PERSONEN_VERWALTEN,
        ]);

        if (hasModifyRechtAtRoot) {
            return true;
        }
        return this.hasSystemrechtAtAnyKontextOfTargetPerson(personId, RollenSystemRecht.PERSONEN_VERWALTEN);
    }

    private async getPersonenkontextsFields(): Promise<PersonKontextFields[]> {
        if (!this.cachedPersonenkontextsFields) {
            const personenkontexte: Personenkontext<true>[] = await this.personenkontextRepo.findByPerson(this.id);
            this.cachedPersonenkontextsFields = personenkontexte.map((personenkontext: Personenkontext<true>) => ({
                rolleId: personenkontext.rolleId,
                organisationId: personenkontext.organisationId,
            }));
        }

        return this.cachedPersonenkontextsFields;
    }

    public async getPersonenkontexteWithRolesAndOrgs(): Promise<PersonenkontextRolleWithOrganisation[]> {
        if (!this.cachedRollenFields) {
            const personKontextFields: PersonKontextFields[] = await this.getPersonenkontextsFields();
            const rollen: Map<RolleID, Rolle<true>> = await this.rolleRepo.findByIds(
                personKontextFields.map((pk: PersonKontextFields) => pk.rolleId),
            );
            const organisationenIds: Array<OrganisationID> = uniq(
                personKontextFields.map((pk: PersonKontextFields) => pk.organisationId),
            );
            const organisationen: Map<OrganisationID, Organisation<true>> = await this.organisationRepo.findByIds(
                organisationenIds,
            );

            this.cachedRollenFields = [];

            for (const pk of personKontextFields) {
                const rolle: Rolle<true> | undefined = rollen.get(pk.rolleId);
                const organisation: Organisation<true> | undefined = organisationen.get(pk.organisationId);
                if (rolle && organisation) {
                    this.cachedRollenFields.push({
                        organisation,
                        rolle: {
                            systemrechte: rolle.systemrechte,
                            serviceProviderIds: rolle.serviceProviderIds,
                        },
                    });
                }
            }
        }

        return this.cachedRollenFields;
    }

    private hasSystemrechtAtAnyKontextOfTargetPerson(
        targetPersonId: PersonID,
        systemrecht: RollenSystemRecht,
    ): Promise<boolean> {
        return this.personenkontextRepo.hasPersonASystemrechtAtAnyKontextOfPersonB(
            this.id,
            targetPersonId,
            systemrecht,
        );
    }

    public get personFields(): PersonFields {
        return this.cachedPersonFields;
    }

    public async hasOrgVerwaltenRechtAtOrga(typ: OrganisationsTyp, administriertVon?: string): Promise<boolean> {
        if (typ === OrganisationsTyp.KLASSE) {
            const [oeffentlich]: [Organisation<true> | undefined, Organisation<true> | undefined] =
                await this.organisationRepo.findRootDirectChildren();
            return this.hasSystemrechtAtOrganisation(
                administriertVon ?? oeffentlich?.id ?? this.organisationRepo.ROOT_ORGANISATION_ID,
                RollenSystemRecht.KLASSEN_VERWALTEN,
            );
        } else if (typ === OrganisationsTyp.SCHULE) {
            return this.hasSystemrechteAtRootOrganisation([RollenSystemRecht.SCHULEN_VERWALTEN]);
        } else if (typ === OrganisationsTyp.TRAEGER) {
            return this.hasSystemrechteAtRootOrganisation([RollenSystemRecht.SCHULTRAEGER_VERWALTEN]);
        }
        return false;
    }
}
