import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { type RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { ExistingRolleUndefined } from '../domain/error/existing-rolle-undefined.error.js';

export class CheckRollenartSpecification {
    public constructor(
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly rolleRepo: RolleRepo,
    ) {}

    public async checkRollenart(sentPKs: Personenkontext<boolean>[]): Promise<boolean> {
        // Fetch all personenkontexte for the person
        let existingPKs: Personenkontext<true>[] = [];

        if (sentPKs[0]?.personId) {
            existingPKs = await this.personenkontextRepo.findByPerson(sentPKs[0]?.personId);
        }

        // Get roles for existing and sent PKs
        const existingRollen: Rolle<true>[] = await this.getUniqueRollenFromPersonenkontexte(existingPKs);
        const sentRollen: Rolle<true>[] = await this.getUniqueRollenFromPersonenkontexte(sentPKs);

        // Check for existing roles
        if (existingRollen.length === 0) {
            // When no roles exist already then check the sentRollen only
            const sentRollenArt: RollenArt | undefined = sentRollen[0]?.rollenart;

            // Check if all the sent Roles have the same role
            const allSentRollenMatch: boolean = sentRollen.every(
                (rolle: Rolle<true>) => rolle.rollenart === sentRollenArt,
            );

            // Returns true only if all roles are the same
            return allSentRollenMatch;
        }

        // Throw an error if for some reason the first element is undefined (This should never happen but just defensive programming)
        if (!existingRollen[0] || !existingRollen[0].rollenart) {
            throw new ExistingRolleUndefined();
        }

        // Get the RollenArt of existing PKs (assuming all existing PKs have the same RollenArt)
        const existingRollenArt: RollenArt = existingRollen[0].rollenart;

        // Check if all sent roles match the existing RollenArt
        const allSentRollenMatchExisting: boolean = sentRollen.every(
            (rolle: Rolle<true>) => rolle.rollenart === existingRollenArt,
        );

        return allSentRollenMatchExisting;
    }

    private async getUniqueRollenFromPersonenkontexte(
        personenkontexte: Personenkontext<boolean>[],
    ): Promise<Rolle<true>[]> {
        const uniqueRolleIds: Set<string> = new Set(personenkontexte.map((pk: Personenkontext<boolean>) => pk.rolleId));
        const mapRollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(Array.from(uniqueRolleIds));
        return Array.from(mapRollen.values());
    }
}
