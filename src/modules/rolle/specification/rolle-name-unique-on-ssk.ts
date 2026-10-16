import { CompositeSpecification } from '../../specification/specifications.js';

import { type Rolle } from '../domain/rolle.js';
import { type RolleRepo } from '../repo/rolle.repo.js';

export class RolleNameUniqueOnSsk extends CompositeSpecification<Rolle<boolean>> {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly newName: string,
    ) {
        super();
    }

    public async isSatisfiedBy(rolle: Rolle<boolean>): Promise<boolean> {
        return this.validateRolleNameIsUniqueOnSSK(rolle, this.newName);
    }

    private async validateRolleNameIsUniqueOnSSK(rolle: Rolle<boolean>, newName: string): Promise<boolean> {
        const rollen: Option<Rolle<true>[]> = await this.rolleRepo.findByName(newName, true);

        if (!rollen || rollen.length === 0) {
            return true;
        }

        const rollenOnSameSSK: Rolle<true>[] = rollen.filter(
            (existingRolle: Rolle<true>) =>
                existingRolle.administeredBySchulstrukturknoten === rolle.administeredBySchulstrukturknoten,
        );

        return !rollenOnSameSSK.some(
            (existingRolle: Rolle<true>) => existingRolle.name === newName && existingRolle.id !== rolle.id,
        );
    }
}
