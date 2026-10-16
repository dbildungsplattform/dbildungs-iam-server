import { Injectable } from '@nestjs/common';
import { DomainError, EntityCouldNotBeDeleted, EntityNotFoundError } from '../../../shared/error/index.js';
import { Paged } from '../../../shared/paging/paged.js';
import { ScopeOperator, ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { PersonenkontextScope } from '../persistence/personenkontext.scope.js';
import { MismatchedRevisionError } from '../../../shared/error/mismatched-revision.error.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DBiamPersonenkontextRepoInternal } from '../persistence/internal-dbiam-personenkontext.repo.js';
import { Personenkontext } from './personenkontext.js';
import { OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonenkontextQueryParams } from '../api/param/personenkontext-query.params.js';

@Injectable()
export class PersonenkontextService {
    public constructor(
        private readonly dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly dBiamPersonenkontextRepoInternal: DBiamPersonenkontextRepoInternal,
        private readonly personRepository: PersonRepository,
    ) {}

    public async findAllPersonenkontexte(
        personenkontext: PersonenkontextQueryParams,
        organisationIDs?: OrganisationID[],
        offset?: number,
        limit?: number,
    ): Promise<Paged<Personenkontext<true>>> {
        const scope: PersonenkontextScope = new PersonenkontextScope()
            .setScopeWhereOperator(ScopeOperator.AND)
            .byOrganisations(organisationIDs)
            .findBy({
                personId: personenkontext.personId,
                username: personenkontext.username,
                personenstatus: personenkontext.personenstatus,
                sichtfreigabe: personenkontext.sichtfreigabe,
            })
            .sortBy('id', ScopeOrder.ASC)
            .paged(offset, limit);

        const [personenkontexte, total]: Counted<Personenkontext<true>> =
            await this.dBiamPersonenkontextRepo.findBy(scope);

        return {
            offset: offset ?? 0,
            limit: limit ?? total,
            total,
            items: personenkontexte,
        };
    }

    public async findPersonenkontextById(id: string): Promise<Result<Personenkontext<true>, DomainError>> {
        const personenkontext: Option<Personenkontext<true>> = await this.dBiamPersonenkontextRepo.findByID(id);
        const result: Result<Personenkontext<true>, DomainError> = personenkontext
            ? { ok: true, value: personenkontext }
            : { ok: false, error: new EntityNotFoundError('Personenkontext', id) };

        return result;
    }

    public async findPersonenkontexteByPersonId(personId: string): Promise<Personenkontext<true>[]> {
        const personenkontexte: Personenkontext<true>[] = await this.dBiamPersonenkontextRepo.findByPerson(personId);
        return personenkontexte;
    }

    public async deletePersonenkontextById(id: string, revision: string): Promise<Result<void, DomainError>> {
        const personenkontext: Option<Personenkontext<true>> = await this.dBiamPersonenkontextRepo.findByID(id);

        if (!personenkontext) {
            return { ok: false, error: new EntityNotFoundError('Personenkontext', id) };
        }

        if (personenkontext?.revision !== revision) {
            return { ok: false, error: new MismatchedRevisionError('Personenkontext') };
        }

        const deletedPersons: boolean = await this.dBiamPersonenkontextRepoInternal.deleteById(id);

        if (deletedPersons === false) {
            return { ok: false, error: new EntityCouldNotBeDeleted('Personenkontext', id) };
        }

        await this.personRepository.syncOrgUnassignmentDate(personenkontext.personId);

        return { ok: true, value: undefined };
    }
}
