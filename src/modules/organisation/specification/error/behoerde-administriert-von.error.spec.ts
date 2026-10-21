import { BehoerdeAdministriertVonError } from './behoerde-administriert-von.error.js';
import { OrganisationSpecificationErrorI18nTypes } from '../../api/dbiam-organisation.error.js';

describe('BehoerdeAdministriertVonError', () => {
    describe('constructor', () => {
        describe('when calling the constructor', () => {
            it('should set message and code', () => {
                const error: BehoerdeAdministriertVonError = new BehoerdeAdministriertVonError('1', {});
                expect(error.message).toBe(
                    `Organisation with ID 1 could not be updated because it violates ${OrganisationSpecificationErrorI18nTypes.BEHOERDE_ADMINISTRIERT_VON} specification`,
                );
                expect(error.code).toBe('ENTITY_COULD_NOT_BE_UPDATED');
            });
        });
    });
});
