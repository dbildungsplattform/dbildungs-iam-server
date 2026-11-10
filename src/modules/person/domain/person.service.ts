import { Injectable } from '@nestjs/common';
import { DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { Paged } from '../../../shared/paging/paged.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { PersonenQueryParams, PersonRepository } from '../persistence/person.repository.js';
import { PersonScope } from '../persistence/person.scope.js';
import { Person } from './person.js';
@Injectable()
export class PersonService {
    public constructor(private readonly personRepository: PersonRepository) {}

    public async findPersons(
        queryParams: PersonenQueryParams,
        permissions: IPersonPermissions,
    ): Promise<Result<Counted<Person<true>>, MissingPermissionsError>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.PERSONEN_VERWALTEN],
            true,
        );

        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            return { ok: false, error: new MissingPermissionsError('NOT_AUTHORIZED') };
        }

        const persons: Counted<Person<true>> = await this.personRepository.findPersons(queryParams, permittedOrgas);

        return { ok: true, value: persons };
    }

    public async findPersonById(id: string): Promise<Result<Person<true>, DomainError>> {
        const person: Option<Person<true>> = await this.personRepository.findById(id);
        if (person) {
            return { ok: true, value: person };
        }
        return { ok: false, error: new EntityNotFoundError('Person', id) };
    }

    public async findAllPersons(
        person: Partial<Person<false>>,
        offset?: number,
        limit?: number,
    ): Promise<Paged<Person<true>>> {
        const scope: PersonScope = new PersonScope()
            .findBy({
                vorname: person.vorname,
                familienname: person.familienname,
            })
            .sortBy('vorname', ScopeOrder.ASC)
            .paged(offset, limit);
        const [persons, total]: Counted<Person<true>> = await this.personRepository.findBy(scope);

        return {
            total,
            offset: offset ?? 0,
            limit: limit ?? total,
            items: persons,
        };
    }
}
