import { uniq } from 'lodash-es';

import { type OrganisationID, type RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { CompositeSpecification } from '../../specification/specifications.js';
import { type Personenkontext } from '../domain/personenkontext.js';

export class LernAnSchuleUndKlasse extends CompositeSpecification<Array<Personenkontext<boolean>>> {
    public constructor(
        private readonly organisationRepository: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
    ) {
        super();
    }

    public async isSatisfiedBy(pks: Array<Personenkontext<boolean>>): Promise<boolean> {
        const lernPKs: Personenkontext<boolean>[] = await this.filterLernPKs(pks);

        if (lernPKs.length === 0) {
            return true;
        }

        return await this.isEveryRolleAtMatchingSchuleAndKlasse(lernPKs);
    }

    /**
     * @param pks List of all Personenkontexte
     * @returns all Personenkontexte with rollenart LERN
     */
    private async filterLernPKs(pks: Personenkontext<boolean>[]): Promise<Personenkontext<boolean>[]> {
        const rolleIDs: RolleID[] = uniq(pks.map((pk: Personenkontext<boolean>) => pk.rolleId));

        const rollen: Map<RolleID, Rolle<true>> = await this.rolleRepo.findByIds(rolleIDs);

        return pks.filter((pk: Personenkontext<boolean>) => rollen.get(pk.rolleId)?.rollenart === RollenArt.LERN);
    }

    private async isEveryRolleAtMatchingSchuleAndKlasse(pks: Personenkontext<boolean>[]): Promise<boolean> {
        const orgaIDs: OrganisationID[] = uniq(pks.map((pk: Personenkontext<boolean>) => pk.organisationId));
        const organisationen: Map<OrganisationID, Organisation<true>> = await this.organisationRepository.findByIds(
            orgaIDs,
        );

        const pksAtSchulen: Personenkontext<boolean>[] = pks.filter(
            (pk: Personenkontext<boolean>) => organisationen.get(pk.organisationId)?.typ === OrganisationsTyp.SCHULE,
        );
        const pksAtKlassen: Personenkontext<boolean>[] = pks.filter(
            (pk: Personenkontext<boolean>) => organisationen.get(pk.organisationId)?.typ === OrganisationsTyp.KLASSE,
        );

        const everySchulePKHasKlassePK: boolean = pksAtSchulen.every((schulePk: Personenkontext<boolean>) =>
            pksAtKlassen.find(
                (klassePk: Personenkontext<boolean>) =>
                    klassePk.rolleId === schulePk.rolleId &&
                    organisationen.get(klassePk.organisationId)?.administriertVon === schulePk.organisationId,
            ),
        );

        const everyKlassePKHasSchulePK: boolean = pksAtKlassen.every((klassePk: Personenkontext<boolean>) =>
            pksAtSchulen.find(
                (schulePk: Personenkontext<boolean>) =>
                    schulePk.rolleId === klassePk.rolleId &&
                    organisationen.get(klassePk.organisationId)?.administriertVon === schulePk.organisationId,
            ),
        );

        return everySchulePKHasKlassePK && everyKlassePKHasSchulePK;
    }
}
