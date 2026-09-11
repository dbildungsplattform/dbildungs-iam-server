import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError, EntityCouldNotBeDeleted } from '../../../shared/error/index.js';
import { PersonenkontextEventKontextData } from '../../../shared/events/personenkontext-event.types.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { PersonDeleteRolleNotFoundError } from './person-delete-rolle-not-found.error.js';

@Injectable()
export class PersonDeleteService {
    public constructor(
        private readonly logger: ClassLogger,
        private personRepository: PersonRepository,
        private personenkontextRepo: DBiamPersonenkontextRepo,
    ) {}

    public async deletePerson(
        personId: string,
        personPermissions: IPersonPermissions,
    ): Promise<Result<void, DomainError>> {
        this.logger.info(`Deleting person with id ${personId}`);
        const removedPersonenkontextsResult: Result<PersonenkontextEventKontextData[], EntityCouldNotBeDeleted> =
            await this.getPersonkontextData(personId);
        if (!removedPersonenkontextsResult.ok) {
            return removedPersonenkontextsResult;
        }

        return this.personRepository.deletePerson(personId, personPermissions, removedPersonenkontextsResult.value);
    }

    public async deletePersonAfterDeadlineExceeded(
        personId: string,
        personPermissions: IPersonPermissions,
    ): Promise<Result<void, DomainError>> {
        this.logger.info(`Deleting person with id ${personId} after deadline exceeded`);
        const removedPersonenkontextsResult: Result<PersonenkontextEventKontextData[], EntityCouldNotBeDeleted> =
            await this.getPersonkontextData(personId);
        if (!removedPersonenkontextsResult.ok) {
            return removedPersonenkontextsResult;
        }

        return this.personRepository.deletePersonAfterDeadlineExceeded(
            personId,
            personPermissions,
            removedPersonenkontextsResult.value,
        );
    }

    private async getPersonkontextData(
        personId: PersonID,
    ): Promise<Result<PersonenkontextEventKontextData[], EntityCouldNotBeDeleted>> {
        try {
            const personenKontexts: Personenkontext<true>[] = await this.personenkontextRepo.findByPerson(personId);

            const removedPersonenkontexts: PersonenkontextEventKontextData[] = await Promise.all(
                personenKontexts.map((personenKontext: Personenkontext<true>) => {
                    return personenKontext.getRolle().then((rolle: Option<Rolle<true>>) => {
                        if (rolle) {
                            return personenKontext
                                .getOrganisation()
                                .then((organisation: Option<Organisation<true>>) => {
                                    const orgaKennung: string | undefined = organisation?.kennung;
                                    return {
                                        id: personenKontext.id,
                                        rolleId: personenKontext.rolleId,
                                        orgaId: personenKontext.organisationId,
                                        rolle: rolle.rollenart,
                                        orgaKennung: orgaKennung,
                                        // The itslearning event listener doesn't care about removed kontexte, only the current kontexte.
                                        // Instead of querying the DB for all relevant organisations, we just set a default value.
                                        isItslearningOrga: false,
                                        serviceProviderExternalSystems: rolle.serviceProviderData.map(
                                            (sp: ServiceProvider<true>) => sp.externalSystem,
                                        ),
                                    };
                                });
                        } else {
                            return Promise.reject(new PersonDeleteRolleNotFoundError(personenKontext));
                        }
                    });
                }),
            );

            return { ok: true, value: removedPersonenkontexts };
        } catch (error) {
            this.logger.logUnknownAsError('Error while loading Kontexts of person to delete', error);
            return { ok: false, error: new EntityCouldNotBeDeleted('Person', personId) };
        }
    }
}
