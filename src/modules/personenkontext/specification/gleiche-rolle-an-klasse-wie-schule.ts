import { CompositeSpecification } from '../../specification/specifications.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { type DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { type Organisation } from '../../organisation/domain/organisation.js';

/**
 * Only needs to be checked when referenced organisation is of type KLASSE.
 * Used to check, that a person already owns identical rolle at schule, when creating Personenkontext
 * for that person with a rolle on a klasse.
 */
export class GleicheRolleAnKlasseWieSchule extends CompositeSpecification<Personenkontext<boolean>> {
    public constructor(
        private readonly organisationRepo: OrganisationRepository,
        private readonly dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly rolleRepo: RolleRepo,
    ) {
        super();
    }

    public async isSatisfiedBy(p: Personenkontext<boolean>): Promise<boolean> {
        const organisation: Option<Organisation<true>> = await this.organisationRepo.findById(p.organisationId);
        if (!organisation) {
            return false;
        }
        if (organisation.typ !== OrganisationsTyp.KLASSE) {
            return true;
        }
        if (!organisation.administriertVon) {
            return false;
        } // Klasse always has to be administered by Schule

        const schule: Option<Organisation<true>> = await this.organisationRepo.findById(organisation.administriertVon);
        if (!schule) {
            return false;
        }

        const personenKontexte: Personenkontext<true>[] = await this.dBiamPersonenkontextRepo.findByPerson(p.personId);
        const matchingKontext: Personenkontext<true> | undefined = personenKontexte.find(
            (pk: Personenkontext<true>) => pk.organisationId === schule.id,
        );
        if (!matchingKontext) {
            return false;
        }
        const rolleAnSchule: Option<Rolle<true>> = await this.rolleRepo.findById(matchingKontext.rolleId);
        if (!rolleAnSchule) {
            return false;
        }

        return rolleAnSchule.id === p.rolleId;
    }
}
