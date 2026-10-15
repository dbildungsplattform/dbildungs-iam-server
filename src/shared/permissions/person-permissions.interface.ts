/* v8 ignore file @preserv */
// type definitions can not be covered by v8, since the code does not exist at runtime
import { type OrganisationID, type PersonID } from '../types/index.js';
import { type RollenSystemRecht } from '../../modules/rolle/domain/systemrecht.js';
import { type RollenMerkmal } from '../../modules/rolle/domain/rolle.enums.js';
import { type PermittedOrgas, type PersonFields } from '../../modules/authentication/domain/person-permissions.js';
import { type OrganisationsTyp } from '../../modules/organisation/domain/organisation.enums.js';

export type IPersonPermissions = {
    id: string;

    readonly personFields: PersonFields;

    hasSystemrechteAtOrganisation(
        organisationId: OrganisationID,
        systemrechte: RollenSystemRecht[],
        matchAll?: boolean,
    ): Promise<boolean>;

    hasSystemrechtAtOrganisation(organisationId: OrganisationID, systemrechte: RollenSystemRecht): Promise<boolean>;

    getPermittedMerkmaleForOrga(organisationId: OrganisationID): Promise<RollenMerkmal[]>;

    /** Checks the gated rights in a Rolle's full Merkmal list; non-gated Merkmale require no additional right. */
    hasPermissionForRolleMerkmale(merkmale: Iterable<RollenMerkmal>, organisationId: OrganisationID): Promise<boolean>;

    hasSystemrechteAtRootOrganisation(systemrechte: RollenSystemRecht[], matchAll?: boolean): Promise<boolean>;

    getOrgIdsWithSystemrecht(
        systemrechte: RollenSystemRecht[],
        withChildren?: boolean,
        matchAll?: boolean,
    ): Promise<PermittedOrgas>;

    canModifyPerson(personId: PersonID): Promise<boolean>;

    hasOrgVerwaltenRechtAtOrga(typ: OrganisationsTyp, administriertVon?: string): Promise<boolean>;
};
