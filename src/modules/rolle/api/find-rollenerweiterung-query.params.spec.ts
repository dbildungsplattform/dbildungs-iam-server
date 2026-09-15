import 'reflect-metadata';

import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { FindRollenerweiterungQueryParams } from './find-rollenerweiterung-query.params.js';

describe('FindRollenerweiterungQueryParams', () => {
    it('should accept a valid organisationId', () => {
        const queryParams: FindRollenerweiterungQueryParams = plainToInstance(FindRollenerweiterungQueryParams, {
            organisationId: faker.string.uuid(),
        });

        const validationErrors: ValidationError[] = validateSync(queryParams);

        expect(validationErrors).toHaveLength(0);
    });

    it('should reject a missing organisationId', () => {
        const queryParams: FindRollenerweiterungQueryParams = plainToInstance(FindRollenerweiterungQueryParams, {});

        const validationErrors: ValidationError[] = validateSync(queryParams);

        expect(validationErrors.some((error: ValidationError) => error.property === 'organisationId')).toBe(true);
    });

    it('should reject a non-uuid organisationId', () => {
        const queryParams: FindRollenerweiterungQueryParams = plainToInstance(FindRollenerweiterungQueryParams, {
            organisationId: 'not-a-uuid',
        });

        const validationErrors: ValidationError[] = validateSync(queryParams);

        expect(validationErrors.some((error: ValidationError) => error.property === 'organisationId')).toBe(true);
    });
});
