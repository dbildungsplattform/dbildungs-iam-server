import { Injectable } from '@nestjs/common';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { Personenkontext } from './personenkontext.js';
import { NurLehrUndLernAnKlasse } from '../specification/nur-lehr-und-lern-an-klasse.js';
import { GleicheRolleAnKlasseWieSchule } from '../specification/gleiche-rolle-an-klasse-wie-schule.js';
import { PersonenkontextKlasseSpecification } from '../specification/personenkontext-klasse-specification.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonenkontextSpecificationError } from '../specification/error/personenkontext-specification.error.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { CheckRollenartSpecification } from '../specification/nur-gleiche-rolle.js';
import { CheckBefristungSpecification } from '../specification/befristung-required-bei-rolle-befristungspflicht.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { RolleID } from '../../../shared/types/aggregate-ids.types.js';

@Injectable()
export class DBiamPersonenkontextService {
    public constructor(
        private readonly dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
    ) {}

    public async checkSpecifications(
        personenkontext: Personenkontext<false>,
    ): Promise<Option<PersonenkontextSpecificationError>> {
        //Check that only teachers and students are added to classes.
        const nurLehrUndLernAnKlasse: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(
            this.organisationRepository,
            this.rolleRepo,
        );
        //Check that person has same role on parent-organisation, if organisation is a class.
        const gleicheRolleAnKlasseWieSchule: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            this.organisationRepository,
            this.dBiamPersonenkontextRepo,
            this.rolleRepo,
        );

        // Checks that the sent personnekontext is of type LERN
        //(Only returns an error if the person has some kontext of type LERN already and the sent PK isn't)
        const nurRollenartLern: CheckRollenartSpecification = new CheckRollenartSpecification(
            this.dBiamPersonenkontextRepo,
            this.rolleRepo,
        );

        // Checks if the sent kontext has a Rolle that is Befristungspflicht. If yes and there is no befristung set then throw an exception
        const befristungRequired: CheckBefristungSpecification = new CheckBefristungSpecification(this.rolleRepo);

        const pkKlasseSpecification: PersonenkontextKlasseSpecification = new PersonenkontextKlasseSpecification(
            nurLehrUndLernAnKlasse,
            gleicheRolleAnKlasseWieSchule,
            nurRollenartLern,
            befristungRequired,
        );

        return pkKlasseSpecification.returnsError(personenkontext);
    }

    public async isPersonalnummerRequiredForAnyPersonenkontextForPerson(personId: string): Promise<boolean> {
        const personenkontexte: Personenkontext<true>[] = await this.dBiamPersonenkontextRepo.findByPerson(personId);
        const roleIds: RolleID[] = personenkontexte.map((pk: Personenkontext<true>) => pk.rolleId)

        return await this.isPersonalnummerRequiredByRoleIds(roleIds)
    }

    public async isPersonalnummerRequiredByRoleIds(roleIds: string[]): Promise<boolean> {
        const uniqueRolleIds: Set<string> = new Set(roleIds);
        const foundRollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(Array.from(uniqueRolleIds));

        return Array.from(foundRollen.values()).some((rolle: Rolle<true>) =>
            rolle.merkmale.includes(RollenMerkmal.KOPERS_PFLICHT),
        );
    }

    public async getKopersPersonenkontexte(personId: string): Promise<Personenkontext<true>[]> {
        const personenkontexte: Personenkontext<true>[] = await this.dBiamPersonenkontextRepo.findByPerson(personId);
        const uniqueRolleIds: Set<string> = new Set(personenkontexte.map((pk: Personenkontext<true>) => pk.rolleId));
        const foundRollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(Array.from(uniqueRolleIds));

        const kopersRolle: Rolle<true>[] = Array.from(foundRollen.values()).filter((rolle: Rolle<true>) =>
            rolle.merkmale.includes(RollenMerkmal.KOPERS_PFLICHT),
        );

        return personenkontexte.filter((pk: Personenkontext<true>) =>
            kopersRolle.some((rolle: Rolle<true>) => rolle.id === pk.rolleId),
        );
    }
}
