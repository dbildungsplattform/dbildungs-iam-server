import { UpdateNotFoundError } from './update-not-found.error.js';
import { type PersonID, type OrganisationID, type RolleID } from '../../../../shared/types/index.js';
import { PersonenkontexteUpdateError } from './personenkontexte-update.error.js';

describe('UpdateNotFoundError', () => {
    it('should create an instance of UpdateNotFoundError with personId, organisationId, rolleId and details', () => {
        const personId: PersonID = '123';
        const organisationId: OrganisationID = '456';
        const rolleId: RolleID = '789';

        const error: UpdateNotFoundError = new UpdateNotFoundError(personId, organisationId, rolleId);

        expect(error).toBeInstanceOf(UpdateNotFoundError);
        expect(error).toBeInstanceOf(PersonenkontexteUpdateError);
        expect(error.message).toBe(
            `Personenkontexte could not be updated because Personenkontext personId:${personId}, organisationId:${organisationId}, rolleId:${rolleId} was not found.`,
        );
        expect(error.code).toBe('ENTITIES_COULD_NOT_BE_UPDATED');
    });

    it('should create an instance of UpdateNotFoundError with personId, organisationId, rolleId and no details', () => {
        const personId: PersonID = '123';
        const organisationId: OrganisationID = '456';
        const rolleId: RolleID = '789';

        const error: UpdateNotFoundError = new UpdateNotFoundError(personId, organisationId, rolleId);

        expect(error).toBeInstanceOf(UpdateNotFoundError);
        expect(error).toBeInstanceOf(PersonenkontexteUpdateError);
        expect(error.message).toBe(
            `Personenkontexte could not be updated because Personenkontext personId:${personId}, organisationId:${organisationId}, rolleId:${rolleId} was not found.`,
        );
        expect(error.details).toBeUndefined();
        expect(error.code).toBe('ENTITIES_COULD_NOT_BE_UPDATED');
    });
});
