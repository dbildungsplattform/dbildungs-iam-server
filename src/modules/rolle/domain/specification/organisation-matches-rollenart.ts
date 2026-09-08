import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../../organisation/domain/organisation.js';
import { RollenArt } from '../rolle.enums.js';
import { Rolle } from '../rolle.js';

/**
 * Only needs to be checked when referenced organisation is of type KLASSE.
 * Needs to be refactored into a specification
 */
export class OrganisationMatchesRollenart {
    public isSatisfiedBy(organisation: Organisation<boolean>, rolle: Rolle<boolean>): boolean {
        if (!organisation.typ) {
            return false;
        }
        return OrganisationMatchesRollenart.getAllowedRollenartenForOrganisationsTyp(organisation.typ).has(
            rolle.rollenart,
        );
    }

    public static getAllowedRollenartenForOrganisationsTyp(organisationsTyp: OrganisationsTyp): Set<RollenArt> {
        switch (organisationsTyp) {
            case OrganisationsTyp.ROOT:
            case OrganisationsTyp.LAND:
                return new Set<RollenArt>([RollenArt.SYSADMIN]);
            case OrganisationsTyp.SCHULE:
                return new Set<RollenArt>([
                    RollenArt.LEIT,
                    RollenArt.LEHR,
                    RollenArt.LERN,
                    RollenArt.SORGBER,
                    RollenArt.SCHB,
                    RollenArt.NLEHR,
                    RollenArt.EXTERN,
                ]);
            case OrganisationsTyp.KLASSE:
                return new Set<RollenArt>([RollenArt.LERN]);
            default:
                return new Set<RollenArt>(Object.values(RollenArt));
        }
    }
}
