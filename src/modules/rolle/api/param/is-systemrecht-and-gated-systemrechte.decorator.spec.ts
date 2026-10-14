import 'reflect-metadata';

import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';

import { RollenSystemRechtEnum } from '../../domain/systemrecht.js';
import { FindRollenForErweiterungQueryParams } from './find-rollen-for-erweiterung.query.params.js';
import { FindRollenForPersonAdministrationQueryParams } from './find-rollen-for-person-administration.query.params.js';

describe('IsSystemrechtAndGatedSystemrechte', () => {
    const queryValidators: Array<{
        name: string;
        requiredSystemrecht: RollenSystemRechtEnum;
        validate: (systemrechte: RollenSystemRechtEnum[]) => ValidationError[];
    }> = [
        {
            name: 'rollenerweiterung',
            requiredSystemrecht: RollenSystemRechtEnum.ROLLEN_ERWEITERN,
            validate: (systemrechte: RollenSystemRechtEnum[]): ValidationError[] =>
                validateSync(
                    plainToInstance(FindRollenForErweiterungQueryParams, {
                        organisationId: faker.string.uuid(),
                        systemrechte,
                    }),
                ),
        },
        {
            name: 'person administration',
            requiredSystemrecht: RollenSystemRechtEnum.PERSONEN_VERWALTEN,
            validate: (systemrechte: RollenSystemRechtEnum[]): ValidationError[] =>
                validateSync(
                    plainToInstance(FindRollenForPersonAdministrationQueryParams, {
                        systemrechte,
                    }),
                ),
        },
    ];

    it.each(queryValidators)(
        '$name should accept the required right with gated rights',
        ({
            requiredSystemrecht,
            validate,
        }: {
            name: string;
            requiredSystemrecht: RollenSystemRechtEnum;
            validate: (systemrechte: RollenSystemRechtEnum[]) => ValidationError[];
        }) => {
            const errors: ValidationError[] = validate([
                requiredSystemrecht,
                RollenSystemRechtEnum.PILOT_5_ROLLEN_ZUORDNEN,
            ]);

            expect(errors).toHaveLength(0);
        },
    );

    it.each(queryValidators)(
        '$name should reject missing required rights',
        ({
            validate,
        }: {
            name: string;
            requiredSystemrecht: RollenSystemRechtEnum;
            validate: (systemrechte: RollenSystemRechtEnum[]) => ValidationError[];
        }) => {
            const errors: ValidationError[] = validate([RollenSystemRechtEnum.PILOT_5_ROLLEN_ZUORDNEN]);

            expect(errors.some((error: ValidationError) => error.property === 'systemrechte')).toBe(true);
        },
    );

    it.each(queryValidators)(
        '$name should reject unrelated rights',
        ({
            requiredSystemrecht,
            validate,
        }: {
            name: string;
            requiredSystemrecht: RollenSystemRechtEnum;
            validate: (systemrechte: RollenSystemRechtEnum[]) => ValidationError[];
        }) => {
            const errors: ValidationError[] = validate([requiredSystemrecht, RollenSystemRechtEnum.ROLLEN_VERWALTEN]);

            expect(errors.some((error: ValidationError) => error.property === 'systemrechte')).toBe(true);
        },
    );
});
