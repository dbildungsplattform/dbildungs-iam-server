import { IPersonPermissions } from '../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, PersonID } from '../../shared/types/index.js';
import { OrganisationsTyp } from '../organisation/domain/organisation.enums.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../rolle/domain/systemrecht.js';
import { RollenMerkmal } from '../rolle/domain/rolle.enums.js';
import { RollenmerkmalSystemrechtPaar } from '../rolle/domain/rollenmerkmal-systemrecht-paar.js';
import {
    PermittedOrgas,
    PersonenkontextRolleWithOrganisation,
    PersonFields,
    PersonPermissions,
} from '../authentication/domain/person-permissions.js';
import { OrganisationRepository } from '../organisation/persistence/organisation.repository.js';
import { Organisation } from '../organisation/domain/organisation.js';
import {
    DBiamPersonenkontextRepo,
    KontextWithOrgaAndRolle,
} from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ClassLogger } from '../../core/logging/class-logger.js';

export type EscalatedPermissionAtOrga = {
    orgaId: OrganisationID | 'ROOT';
    systemrechte: Array<RollenSystemRechtEnum> | 'ALL';
};

const ESCALATED_PERSON_PERMISSIONS_BRAND: string = 'ESCALATED_PERSON_PERMISSIONS_BRAND';

export function isEscalatedPersonPermissions(obj: unknown): obj is EscalatedPersonPermissions {
    return (
        typeof obj === 'object' && obj !== null && 'brand' in obj && obj.brand === ESCALATED_PERSON_PERMISSIONS_BRAND
    );
}

export class EscalatedPersonPermissions implements IPersonPermissions {
    public readonly id: string;

    private escalatedPermissions: Record<string, Array<RollenSystemRechtEnum> | 'ALL'> = {};

    private readonly cachedPersonFields: PersonFields;

    private readonly brand: string = ESCALATED_PERSON_PERMISSIONS_BRAND;

    private constructor(
        id: string,
        escalatedPermissions: Array<EscalatedPermissionAtOrga>,
        private readonly organisationRepo: OrganisationRepository,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly logger: ClassLogger,
    ) {
        this.id = id;
        escalatedPermissions.forEach((perm: EscalatedPermissionAtOrga) => {
            const id: string = perm.orgaId === 'ROOT' ? this.getRootOrgaId() : perm.orgaId;

            const existing: Array<RollenSystemRechtEnum> | 'ALL' | undefined = this.escalatedPermissions[id];
            if (existing === 'ALL' || perm.systemrechte === 'ALL') {
                this.escalatedPermissions[id] = 'ALL';
            } else if (Array.isArray(existing)) {
                this.escalatedPermissions[id] = Array.from(new Set([...existing, ...perm.systemrechte]));
            } else {
                this.escalatedPermissions[id] = perm.systemrechte;
            }
        });
        this.cachedPersonFields = {
            id: id,
            keycloakUserId: undefined,
            vorname: `EscalatedPersonPermissions-${id}`,
            familienname: `EscalatedPersonPermissions-${id}`,
            username: `EscalatedPersonPermissions-${id}`,
            updatedAt: new Date(),
        };

        this.logger.info(
            `Created new ${this.brand} for ${id} with escalated permissions: ${JSON.stringify(escalatedPermissions)}`,
        );
    }

    public static async fromPersonPermissions(
        personPermissions: PersonPermissions,
        additionalEscalatedPermissions: Array<EscalatedPermissionAtOrga>,
        organisationRepo: OrganisationRepository,
        personenkontextRepo: DBiamPersonenkontextRepo,
        logger: ClassLogger,
    ): Promise<EscalatedPersonPermissions> {
        const allEscalatedPermissions: EscalatedPermissionAtOrga[] = additionalEscalatedPermissions;

        const allKontexte: PersonenkontextRolleWithOrganisation[] =
            await personPermissions.getPersonenkontexteWithRolesAndOrgs();

        allKontexte.forEach((kontext: PersonenkontextRolleWithOrganisation) => {
            const existingPermsForOrga: EscalatedPermissionAtOrga[] = allEscalatedPermissions.filter(
                (perm: EscalatedPermissionAtOrga) => perm.orgaId === kontext.organisation.id,
            );

            const hasAllAlready: boolean = existingPermsForOrga.some(
                (perm: EscalatedPermissionAtOrga) => perm.systemrechte === 'ALL',
            );

            if (hasAllAlready) {
                logger.debug(
                    `Skipping adding permissions from kontext for orga ${kontext.organisation.id}: already has ALL rights by additionalEscalatedPermissions`,
                );
                return;
            }

            const existingSystemrechte: RollenSystemRechtEnum[] = existingPermsForOrga.flatMap(
                (perm: EscalatedPermissionAtOrga) => perm.systemrechte as RollenSystemRechtEnum[],
            );

            const newSystemrechte: RollenSystemRechtEnum[] = kontext.rolle.systemrechte
                .map((recht: RollenSystemRecht) => recht.name)
                .filter((recht: RollenSystemRechtEnum) => !existingSystemrechte.includes(recht));

            if (newSystemrechte.length === 0) {
                logger.debug(
                    `Skipping adding permissions from kontext for orga ${kontext.organisation.id}: no new systemrechte to add`,
                );
                return;
            }

            allEscalatedPermissions.push({
                orgaId: kontext.organisation.id,
                systemrechte: [...existingSystemrechte, ...newSystemrechte],
            } satisfies EscalatedPermissionAtOrga);
        });

        return new EscalatedPersonPermissions(
            personPermissions.id,
            allEscalatedPermissions,
            organisationRepo,
            personenkontextRepo,
            logger,
        );
    }

    public static createNew(
        esacalator: { name: string },
        escalatedPermissions: Array<EscalatedPermissionAtOrga>,
        organisationRepo: OrganisationRepository,
        personenkontextRepo: DBiamPersonenkontextRepo,
        logger: ClassLogger,
    ): EscalatedPersonPermissions {
        return new EscalatedPersonPermissions(
            esacalator.name,
            escalatedPermissions,
            organisationRepo,
            personenkontextRepo,
            logger,
        );
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
        for (const [orgaId, systemrechteOnOrga] of Object.entries(this.escalatedPermissions)) {
            if (systemrechteOnOrga === 'ALL') {
                organisationIDs.add(orgaId);
            } else {
                const hasRequiredRechte: boolean = matchAll
                    ? systemrechte.every((recht: RollenSystemRecht) => systemrechteOnOrga.includes(recht.name))
                    : systemrechte.some((recht: RollenSystemRecht) => systemrechteOnOrga.includes(recht.name));
                if (hasRequiredRechte) {
                    organisationIDs.add(orgaId);
                }
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

    public extendEscalation(additional: Array<EscalatedPermissionAtOrga>): void {
        for (const newPerm of additional) {
            const orgaId: string = newPerm.orgaId === 'ROOT' ? this.getRootOrgaId() : newPerm.orgaId;
            const existing: RollenSystemRechtEnum[] | 'ALL' | undefined = this.escalatedPermissions[orgaId];

            if (!existing) {
                this.logger.info(
                    `Extending escalation for ${this.id}: adding new orga ${orgaId} with rights ${JSON.stringify(newPerm.systemrechte)}`,
                );
                this.escalatedPermissions[orgaId] = newPerm.systemrechte;
                continue;
            }

            if (existing === 'ALL') {
                this.logger.debug(`Skipping escalation for orga ${orgaId}: already has ALL rights`);
                continue;
            }

            if (newPerm.systemrechte === 'ALL') {
                this.logger.info(`Extending escalation for ${this.id}: orga ${orgaId} escalated to ALL rights`);
                this.escalatedPermissions[orgaId] = 'ALL';
                continue;
            }

            const before: RollenSystemRechtEnum[] = [...existing];
            const added: RollenSystemRechtEnum[] = newPerm.systemrechte.filter(
                (r: RollenSystemRechtEnum) => !existing.includes(r),
            );

            if (added.length > 0) {
                this.escalatedPermissions[orgaId] = Array.from(new Set([...existing, ...added]));
                this.logger.info(
                    `Extending escalation for ${this.id}: orga ${orgaId} added rights ${JSON.stringify(added)} (before: ${JSON.stringify(before)}, after: ${JSON.stringify(this.escalatedPermissions[orgaId])})`,
                );
            } else {
                this.logger.debug(`Skipping escalation for orga ${orgaId}: no new rights`);
            }
        }
    }

    public async hasSystemrechteAtOrganisation(
        organisationId: OrganisationID,
        systemrechte: RollenSystemRecht[],
        matchAll: boolean = true,
    ): Promise<boolean> {
        if (this.isOrgaIdRoot(organisationId)) {
            const systemrechteOnRoot: RollenSystemRechtEnum[] | undefined | 'ALL' =
                this.escalatedPermissions[organisationId];
            if (systemrechteOnRoot === 'ALL') {
                return true;
            }
            if (!systemrechteOnRoot) {
                return false;
            }

            return matchAll
                ? systemrechte.every((recht: RollenSystemRecht) => systemrechteOnRoot.includes(recht.name))
                : systemrechte.some((recht: RollenSystemRecht) => systemrechteOnRoot.includes(recht.name));
        } else {
            const parentOrgas: Organisation<true>[] = await this.organisationRepo.findParentOrgasForIds([
                organisationId,
            ]);
            const thisAndParentOrgaIds: OrganisationID[] = [
                parentOrgas.map((o: Organisation<true>) => o.id),
                organisationId,
            ].flat();

            const combindedRechteForThisAndParents: (RollenSystemRechtEnum | 'ALL')[] = thisAndParentOrgaIds
                .map((orgaId: OrganisationID) => {
                    return this.escalatedPermissions[orgaId] ?? [];
                })
                .flat();
            if (combindedRechteForThisAndParents.includes('ALL')) {
                return true;
            }

            return matchAll
                ? systemrechte.every((recht: RollenSystemRecht) =>
                      combindedRechteForThisAndParents.includes(recht.name),
                  )
                : systemrechte.some((recht: RollenSystemRecht) =>
                      combindedRechteForThisAndParents.includes(recht.name),
                  );
        }
    }

    public async hasSystemrechteAtRootOrganisation(
        systemrechte: RollenSystemRecht[],
        matchAll: boolean = true,
    ): Promise<boolean> {
        return this.hasSystemrechteAtOrganisation(this.getRootOrgaId(), systemrechte, matchAll);
    }

    public async hasSystemrechtAtOrganisation(
        organisationId: OrganisationID,
        systemrecht: RollenSystemRecht,
    ): Promise<boolean> {
        return this.hasSystemrechteAtOrganisation(organisationId, [systemrecht], true);
    }

    public async getPermittedMerkmaleForOrga(organisationId: OrganisationID): Promise<RollenMerkmal[]> {
        return RollenmerkmalSystemrechtPaar.getPermittedMerkmaleForOrga(this, organisationId);
    }

    public hasPermissionForGatedMerkmale(
        merkmale: Iterable<RollenMerkmal>,
        organisationId: OrganisationID,
    ): Promise<boolean> {
        return RollenmerkmalSystemrechtPaar.hasPermissionForGatedMerkmale(this, merkmale, organisationId);
    }

    public async canModifyPerson(personId: PersonID): Promise<boolean> {
        const hasModifyRechtAtRoot: boolean = await this.hasSystemrechteAtRootOrganisation([
            RollenSystemRecht.PERSONEN_VERWALTEN,
        ]);

        if (hasModifyRechtAtRoot) {
            return true;
        }
        const orgaIdsForPerson: string[] = (await this.personenkontextRepo.findByPersonWithOrgaAndRolle(personId)).map(
            (pk: KontextWithOrgaAndRolle) => pk.organisation.id,
        );
        for (const orgaId of orgaIdsForPerson) {
            // Await in Loop used on purpose to have early returns and not check more orgaIds than necessary
            // eslint-disable-next-line no-await-in-loop
            if (await this.hasSystemrechtAtOrganisation(orgaId, RollenSystemRecht.PERSONEN_VERWALTEN)) {
                return true;
            }
        }
        return false;
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

    private isOrgaIdRoot(organisationId: OrganisationID): boolean {
        return this.organisationRepo.ROOT_ORGANISATION_ID === organisationId;
    }

    private getRootOrgaId(): string {
        return this.organisationRepo.ROOT_ORGANISATION_ID;
    }
}
