import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { type Rolle } from '../../rolle/domain/rolle.js';

export class CheckBefristungSpecification {
    public constructor(private readonly rolleRepo: RolleRepo) {}

    public async checkBefristung(sentPKs: Personenkontext<boolean>[]): Promise<boolean> {
        // Early return if all Personenkontext have befristung defined
        if (sentPKs.every((pk: Personenkontext<boolean>) => pk.befristung !== undefined)) {
            return true;
        }
        // Extract unique Rolle IDs from sentPKs
        const uniqueRolleIds: Set<string> = new Set(sentPKs.map((pk: Personenkontext<boolean>) => pk.rolleId));

        const mapRollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(Array.from(uniqueRolleIds));

        for (const pk of sentPKs) {
            const rolle: Rolle<true> | undefined = mapRollen.get(pk.rolleId);
            if (rolle && rolle.merkmale.includes(RollenMerkmal.BEFRISTUNG_PFLICHT)) {
                // Check if befristung is set
                if (pk.befristung === undefined) {
                    return false;
                }
            }
        }
        return true;
    }
}
