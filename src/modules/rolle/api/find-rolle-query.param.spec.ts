import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';

import { RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { FindRollenQueryParams } from './find-rollen-query.params.js';

describe('FindRollenQueryParams', () => {
    it('should accept MPT_ROLLEN_VERWALTEN for rollen admin queries', () => {
        const queryParams: FindRollenQueryParams = plainToInstance(FindRollenQueryParams, {
            systemrechte: [RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN],
        });

        const validationErrors: ValidationError[] = validateSync(queryParams);

        expect(validationErrors).toHaveLength(0);
    });
});
