import { type OrganisationID, type PersonID, type RolleID } from '../../../../shared/types/index.js';
import { PersonenkontexteUpdateError } from './personenkontexte-update.error.js';

export class UpdateNotFoundError extends PersonenkontexteUpdateError {
    public constructor(
        personId: PersonID,
        organisationId: OrganisationID,
        rolleId: RolleID,
        details?: unknown[] | Record<string, undefined>,
    ) {
        super(
            `Personenkontexte could not be updated because Personenkontext personId:${personId}, organisationId:${organisationId}, rolleId:${rolleId} was not found.`,
            details,
        );
    }
}
