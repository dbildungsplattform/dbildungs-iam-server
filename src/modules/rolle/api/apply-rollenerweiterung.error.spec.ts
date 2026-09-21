import { ApplyRollenerweiterungError } from './apply-rollenerweiterung.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { faker } from '@faker-js/faker';

describe('ApplyRollenerweiterungError', () => {
    it('should set errors, ids, message and code', () => {
        const rolle1Id: string = faker.string.uuid();
        const rolle2Id: string = faker.string.uuid();

        const error1: EntityNotFoundError = new EntityNotFoundError('Error 1');
        const error2: EntityNotFoundError = new EntityNotFoundError('Error 2');
        const errors: {
            id: string;
            error: EntityNotFoundError;
        }[] = [
            { id: rolle1Id, error: error1 },
            { id: rolle2Id, error: error2 },
        ];
        const applyError: ApplyRollenerweiterungError = new ApplyRollenerweiterungError(errors);

        expect(applyError.errors).toEqual([
            { id: rolle1Id, error: error1 },
            { id: rolle2Id, error: error2 },
        ]);
        expect(applyError.message).toBe('2 errors occured while applying rollenerweiterungen');
        expect(applyError.code).toBe('MULTI_DOMAIN_ERROR');
    });

    it('should handle empty errors array', () => {
        const applyError: ApplyRollenerweiterungError = new ApplyRollenerweiterungError([]);
        expect(applyError.errors).toEqual([]);
        expect(applyError.message).toBe('0 errors occured while applying rollenerweiterungen');
        expect(applyError.code).toBe('MULTI_DOMAIN_ERROR');
    });
});
