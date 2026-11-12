import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError, EntityNotFoundError } from '../../../shared/error/index.js';
import { Paged } from '../../../shared/paging/paged.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { PersonScope } from '../persistence/person.scope.js';
import { PersonDomainError } from './person-domain.error.js';
import { DownstreamKeycloakError } from './person-keycloak.error.js';
import { NotFoundOrNoPermissionError } from './person-not-found-or-no-permission.error.js';
import { PersonLockOccasion } from './person.enums.js';
import { Person } from './person.js';
@Injectable()
export class PersonService {
    public constructor(
        private readonly personRepository: PersonRepository,
        private readonly keycloakUserService: KeycloakUserService,
        private readonly logger: ClassLogger,
    ) {}

    public async lockPerson(
        personId: PersonID,
        permissions: IPersonPermissions,
        lock: boolean,
        lockedBy: string,
        lockedUntil?: Date,
    ): Promise<Result<void, DomainError>> {
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            personId,
            permissions,
        );

        if (!personResult.ok) {
            const error: NotFoundOrNoPermissionError = new NotFoundOrNoPermissionError(personId);
            this.logPersonLockError(personId, permissions, lock, error);

            return { ok: false, error };
        }

        if (!personResult.value.keycloakUserId) {
            const error: PersonDomainError = new PersonDomainError(
                `Person with id ${personId} has no keycloak id`,
                personId,
            );
            this.logPersonLockError(personId, permissions, lock, error, personResult.value);

            return { ok: false, error };
        }

        const userLock: UserLock = {
            person: personId,
            locked_by: lockedBy,
            locked_until: lockedUntil,
            locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
            created_at: undefined,
        };

        const result: Result<void, DomainError> = await this.keycloakUserService.updateKeycloakUserStatus(
            personId,
            personResult.value.keycloakUserId,
            userLock,
            lock,
        );
        if (!result.ok) {
            const error: DownstreamKeycloakError = new DownstreamKeycloakError(result.error.message, personId, [
                result.error.details,
            ]);
            this.logPersonLockError(personId, permissions, lock, error, personResult.value, userLock.locked_by);

            return { ok: false, error };
        }

        this.logPersonLockSuccess(personResult.value, permissions, lock, userLock);

        return { ok: true, value: undefined };
    }

    private logPersonLockError(
        personId: PersonID,
        permissions: IPersonPermissions,
        lock: boolean,
        error: DomainError,
        person?: Person<true>,
        lockedBy?: string,
    ): void {
        const action: string = lock ? 'sperren' : 'entsperren';
        this.logger.error(
            `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}, Sperrende Organisation: ${lockedBy}) hat versucht den Benutzer ${person?.username} (BenutzerId: ${personId}) zu ${action}. Fehler: ${error.message}.`,
        );
    }

    private logPersonLockSuccess(
        person: Person<true>,
        permissions: IPersonPermissions,
        lock: boolean,
        userLock: UserLock,
    ): void {
        this.logger.info(
            `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}, Sperrende Organisation: ${userLock.locked_by}) hat Benutzer ${person.username} (BenutzerId: ${userLock.person})) ${lock ? 'gesperrt' : 'entsperrt'} (Befristung: ${userLock.locked_until?.toString() ?? 'unbefristet'}).`,
        );
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
