import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/error/index.js';
import { Personenkontext } from './personenkontext.js';
import { PersonenkontextWorkflowFactory } from './personenkontext-workflow.factory.js';
import { PersonenkontextWorkflowAggregate } from './personenkontext-workflow.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonFactory } from '../../person/domain/person.factory.js';
import { DbiamPersonenkontextFactory } from './dbiam-personenkontext.factory.js';
import { PersonenkontexteUpdateError } from './error/personenkontexte-update.error.js';
import { PersonenkontexteUpdate } from './personenkontexte-update.js';
import { DbiamCreatePersonenkontextBodyParams } from '../api/param/dbiam-create-personenkontext.body.params.js';
import { OperationContext } from './personenkontext.enums.js';
import { EscalatedPermissionAtOrga } from '../../permission/escalated-person-permissions.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { Err, Ok } from '../../../shared/util/result.js';

export type PersonPersonenkontext = {
    person: Person<true>;
    personenkontexte: Personenkontext<true>[];
};

@Injectable()
export class PersonenkontextCreationService {
    public constructor(
        private readonly personRepository: PersonRepository,
        private readonly personFactory: PersonFactory,
        private readonly personenkontextWorkflowFactory: PersonenkontextWorkflowFactory,
        private readonly dbiamPersonenkontextFactory: DbiamPersonenkontextFactory,
        private readonly escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
    ) {}

    public async createPersonWithPersonenkontexte(
        permissions: IPersonPermissions,
        vorname: string,
        familienname: string,
        createPersonenkontexte: DbiamCreatePersonenkontextBodyParams[],
        personalnummer?: string,
        befristung?: Date,
    ): Promise<Result<PersonPersonenkontext, DomainError>> {
        const personOrError: Person<false> | DomainError = await this.personFactory.createNew({
            vorname: vorname,
            familienname: familienname,
            personalnummer: personalnummer,
        });
        if (personOrError instanceof DomainError) {
            return Err(personOrError);
        }

        const anlage: PersonenkontextWorkflowAggregate = this.personenkontextWorkflowFactory.createNew();
        /* eslint-disable no-await-in-loop */
        for (const createPersonenkontext of createPersonenkontexte) {
            // No person ID
            anlage.initialize(undefined, createPersonenkontext.organisationId, [createPersonenkontext.rolleId]);
            const canCommit: Result<void, DomainError> = await anlage.canCommit(
                permissions,
                OperationContext.PERSON_ANLEGEN,
            );
            if (!canCommit.ok) {
                return canCommit;
            }
        }

        //Save Person
        const savedPersonOrError: DomainError | Person<true> = await this.personRepository.create(personOrError);

        if (savedPersonOrError instanceof DomainError) {
            return Err(savedPersonOrError);
        }

        /* We must grant PERSONEN_VERWALTEN on the ROOT level instead of only on the schools
        of the newly created Personenkontexte.

        Reason:
        EscalatedPermission.canModifyPerson is executed *after* the person is persisted,
        but *before* the Personenkontexte are persisted. At that point, the new person
        has no contexts in the database yet.

        As a result, the caller would not be allowed to modify the person based on
        school-level permissions alone, because there are no associated contexts to
        validate against.

        Granting PERSONEN_VERWALTEN on ROOT ensures the caller can modify the person
        regardless of which contexts will be created afterward. */
        const permissionsToUse: IPersonPermissions = await this.escalatedPersonPermissionsFactory.fromPermissions(
            permissions,
            [
                {
                    orgaId: 'ROOT',
                    systemrechte: [RollenSystemRechtEnum.PERSONEN_VERWALTEN],
                } satisfies EscalatedPermissionAtOrga,
            ],
        );

        const pkUpdate: PersonenkontexteUpdate = this.dbiamPersonenkontextFactory.createNewPersonenkontexteUpdate(
            savedPersonOrError.id,
            new Date(),
            0,
            createPersonenkontexte.map((createPersonenkontext: DbiamCreatePersonenkontextBodyParams) => ({
                personId: savedPersonOrError.id,
                organisationId: createPersonenkontext.organisationId,
                rolleId: createPersonenkontext.rolleId,
                befristung,
            })),
            permissionsToUse,
        );

        const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError = await pkUpdate.update();
        if (updateResult instanceof DomainError) {
            return Err(updateResult);
        }

        if (updateResult.length !== createPersonenkontexte.length) {
            return Err(new PersonenkontexteUpdateError('The number of updated personenkontexte is invalid'));
        }

        return Ok({
            person: savedPersonOrError,
            personenkontexte: updateResult,
        });
    }
}
