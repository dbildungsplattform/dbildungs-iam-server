import type { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { RollenMerkmal } from './rolle.enums.js';
import { RollenSystemRecht } from './systemrecht.js';

/**
 * Links a RollenMerkmal that gates the visibility/assignability of a Rolle to the RollenSystemRecht that is
 * required to see or manage Rollen carrying that Merkmal (e.g. MPT-Rollen and Pilot-X-Rollen).
 *
 * This is the single source of truth for all Merkmal<->Systemrecht pairs. To introduce a new pair
 * (e.g. a future Pilot-6), add one static field and append it to `ALL`. Every consumer derives from that list.
 * The list is defined as static readonly fields, so it is built once when the module is loaded (i.e. cached for
 * the lifetime of the application) instead of being recomputed on every access.
 */
export class RollenmerkmalSystemrechtPaar {
    private constructor(
        public readonly merkmal: RollenMerkmal,
        public readonly systemrecht: RollenSystemRecht,
    ) {}

    public static readonly MPT: RollenmerkmalSystemrechtPaar = new RollenmerkmalSystemrechtPaar(
        RollenMerkmal.MPT_ROLLE,
        RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
    );

    public static readonly PILOT_1: RollenmerkmalSystemrechtPaar = new RollenmerkmalSystemrechtPaar(
        RollenMerkmal.PILOT_1_ROLLE,
        RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN,
    );

    public static readonly PILOT_2: RollenmerkmalSystemrechtPaar = new RollenmerkmalSystemrechtPaar(
        RollenMerkmal.PILOT_2_ROLLE,
        RollenSystemRecht.PILOT_2_ROLLEN_ZUORDNEN,
    );

    public static readonly PILOT_3: RollenmerkmalSystemrechtPaar = new RollenmerkmalSystemrechtPaar(
        RollenMerkmal.PILOT_3_ROLLE,
        RollenSystemRecht.PILOT_3_ROLLEN_ZUORDNEN,
    );

    public static readonly PILOT_4: RollenmerkmalSystemrechtPaar = new RollenmerkmalSystemrechtPaar(
        RollenMerkmal.PILOT_4_ROLLE,
        RollenSystemRecht.PILOT_4_ROLLEN_ZUORDNEN,
    );

    public static readonly PILOT_5: RollenmerkmalSystemrechtPaar = new RollenmerkmalSystemrechtPaar(
        RollenMerkmal.PILOT_5_ROLLE,
        RollenSystemRecht.PILOT_5_ROLLEN_ZUORDNEN,
    );

    // Add new pairs here (and only here) when new Pilot-Merkmal/Systemrecht pairs are introduced.
    public static readonly ALL: ReadonlyArray<RollenmerkmalSystemrechtPaar> = [
        RollenmerkmalSystemrechtPaar.MPT,
        RollenmerkmalSystemrechtPaar.PILOT_1,
        RollenmerkmalSystemrechtPaar.PILOT_2,
        RollenmerkmalSystemrechtPaar.PILOT_3,
        RollenmerkmalSystemrechtPaar.PILOT_4,
        RollenmerkmalSystemrechtPaar.PILOT_5,
    ];

    public static readonly GATED_MERKMALE: ReadonlyArray<RollenMerkmal> = RollenmerkmalSystemrechtPaar.ALL.map(
        (paar: RollenmerkmalSystemrechtPaar) => paar.merkmal,
    );

    public static readonly GATED_SYSTEMRECHTE: ReadonlyArray<RollenSystemRecht> = RollenmerkmalSystemrechtPaar.ALL.map(
        (paar: RollenmerkmalSystemrechtPaar) => paar.systemrecht,
    );

    public static bySystemrecht(systemrecht: RollenSystemRecht): RollenmerkmalSystemrechtPaar | undefined {
        return RollenmerkmalSystemrechtPaar.ALL.find(
            (paar: RollenmerkmalSystemrechtPaar) => paar.systemrecht === systemrecht,
        );
    }

    public static byMerkmal(merkmal: RollenMerkmal): RollenmerkmalSystemrechtPaar | undefined {
        return RollenmerkmalSystemrechtPaar.ALL.find((paar: RollenmerkmalSystemrechtPaar) => paar.merkmal === merkmal);
    }

    public static isGatedMerkmal(merkmal: RollenMerkmal): boolean {
        return RollenmerkmalSystemrechtPaar.GATED_MERKMALE.includes(merkmal);
    }

    public static isGatedSystemrecht(systemrecht: RollenSystemRecht): boolean {
        return RollenmerkmalSystemrechtPaar.GATED_SYSTEMRECHTE.includes(systemrecht);
    }

    /** Returns the subset of the given Merkmale that are gated by a RollenSystemRecht. */
    public static gatedMerkmaleOf(merkmale: Iterable<RollenMerkmal>): RollenMerkmal[] {
        return Array.from(merkmale).filter((merkmal: RollenMerkmal) =>
            RollenmerkmalSystemrechtPaar.isGatedMerkmal(merkmal),
        );
    }

    public static getGatedMerkmaleNotIncludedIn(merkmale: Iterable<RollenMerkmal>): RollenMerkmal[] {
        const includedMerkmale: Set<RollenMerkmal> = new Set(merkmale);
        return RollenmerkmalSystemrechtPaar.GATED_MERKMALE.filter(
            (merkmal: RollenMerkmal) => !includedMerkmale.has(merkmal),
        );
    }

    public static async getPermittedMerkmaleForOrga(
        permissions: IPersonPermissions,
        organisationId: OrganisationID,
    ): Promise<RollenMerkmal[]> {
        const permissionsPerPaar: boolean[] = await Promise.all(
            RollenmerkmalSystemrechtPaar.ALL.map((paar: RollenmerkmalSystemrechtPaar) =>
                permissions.hasSystemrechtAtOrganisation(organisationId, paar.systemrecht),
            ),
        );
        return RollenmerkmalSystemrechtPaar.ALL.filter(
            (_paar: RollenmerkmalSystemrechtPaar, index: number) => permissionsPerPaar[index],
        ).map((paar: RollenmerkmalSystemrechtPaar) => paar.merkmal);
    }

    public static async hasPermissionForRolleMerkmale(
        permissions: IPersonPermissions,
        merkmale: Iterable<RollenMerkmal>,
        organisationId: OrganisationID,
    ): Promise<boolean> {
        const requiredMerkmale: RollenMerkmal[] = RollenmerkmalSystemrechtPaar.gatedMerkmaleOf(merkmale);
        if (requiredMerkmale.length === 0) {
            return true;
        }
        const permittedMerkmale: RollenMerkmal[] = await permissions.getPermittedMerkmaleForOrga(organisationId);
        return requiredMerkmale.every((merkmal: RollenMerkmal) => permittedMerkmale.includes(merkmal));
    }
}
