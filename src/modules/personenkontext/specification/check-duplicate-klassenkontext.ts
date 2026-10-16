import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';

export class CheckDuplicateKlassenkontextSpecification {
    public constructor(
        private readonly organisationRepo: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
    ) {}

    // This method checks for duplicate Klassenkontext entries under the same administrating organisation with the same rolleId (Should return false if duplicates are found)
    public async checkDuplicateKlassenkontext(sentPKs: Personenkontext<boolean>[]): Promise<boolean> {
        // Get all unique rolle IDs from sent PKs
        const uniqueRolleIds: Set<string> = new Set(sentPKs.map((pk: Personenkontext<boolean>) => pk.rolleId));
        const mapRollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(Array.from(uniqueRolleIds));

        // Get all unique organisation IDs from sent PKs
        const uniqueOrgIds: Set<string> = new Set(sentPKs.map((pk: Personenkontext<boolean>) => pk.organisationId));
        const mapOrganisationen: Map<string, Organisation<true>> = await this.organisationRepo.findByIds(
            Array.from(uniqueOrgIds),
        );

        // Track combinations of (administriertVon, rolleId) for Klasse organisations
        const klassenkontextCombinations: Map<string, Set<string>> = new Map();

        for (const pk of sentPKs) {
            const organisation: Organisation<true> | undefined = mapOrganisationen.get(pk.organisationId);
            const rolle: Rolle<true> | undefined = mapRollen.get(pk.rolleId);

            // Skip if organisation or rolle not found
            if (!organisation || !rolle) {
                continue;
            }

            // Only check for Klasse organisations with LERN rolle
            if (organisation.typ === OrganisationsTyp.KLASSE && rolle.rollenart === RollenArt.LERN) {
                const administriertVon: string = organisation.administriertVon!;

                // Create a key for the administering organisation
                if (!klassenkontextCombinations.has(administriertVon)) {
                    klassenkontextCombinations.set(administriertVon, new Set());
                }

                const rollenSet: Set<string> | undefined = klassenkontextCombinations.get(administriertVon);

                // Check if this rolle already exists under this administering organisation
                if (rollenSet?.has(pk.rolleId)) {
                    // Duplicate found: same rolle under same administriertVon
                    return false;
                }

                // Add this rolle to the set for this administering organisation
                rollenSet?.add(pk.rolleId);
            }
        }

        // No duplicates found
        return true;
    }
}
