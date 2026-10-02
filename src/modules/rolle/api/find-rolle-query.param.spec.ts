import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';

import { RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { FindRollenForMptZuordnungQueryParams } from './param/find-rollen-for-mpt-zuordnung.query.params.js';
import { FindRollenQueryParams } from './param/find-rollen.query.params.js';

describe('FindRollenQueryParams', () => {
    const organisationId: string = 'a1f0c3de-8c5c-4a4f-9c1b-9a9b78492b31';
    const rolleId: string = 'b2a1d4ef-9d6d-4b50-8d2c-0b0c895a3c42';

    it('should accept MPT_ROLLEN_ZUORDNEN for rollen admin queries', () => {
        const queryParams: FindRollenQueryParams = plainToInstance(FindRollenQueryParams, {
            systemrechte: [RollenSystemRechtEnum.MPT_ROLLEN_ZUORDNEN],
        });

        const validationErrors: ValidationError[] = validateSync(queryParams);

        expect(validationErrors).toHaveLength(0);
    });

    describe.each([FindRollenQueryParams, FindRollenForMptZuordnungQueryParams])(
        'shared ID filters for %p',
        (QueryParams: typeof FindRollenQueryParams | typeof FindRollenForMptZuordnungQueryParams) => {
            it('transforms scalar IDs to arrays', () => {
                const queryParams: InstanceType<typeof QueryParams> = plainToInstance(QueryParams, {
                    organisationIds: organisationId,
                    rolleIds: rolleId,
                });

                expect(queryParams.organisationIds).toEqual([organisationId]);
                expect(queryParams.rolleIds).toEqual([rolleId]);
            });

            it('accepts unique UUID arrays', () => {
                const queryParams: InstanceType<typeof QueryParams> = plainToInstance(QueryParams, {
                    organisationIds: [organisationId],
                    rolleIds: [rolleId],
                });

                expect(validateSync(queryParams)).toHaveLength(0);
            });

            it('rejects duplicate IDs', () => {
                const queryParams: InstanceType<typeof QueryParams> = plainToInstance(QueryParams, {
                    organisationIds: [organisationId, organisationId],
                    rolleIds: [rolleId, rolleId],
                });

                const validationErrors: ValidationError[] = validateSync(queryParams);

                expect(validationErrors.map((error: ValidationError) => error.property)).toEqual(
                    expect.arrayContaining(['organisationIds', 'rolleIds']),
                );
            });

            it('rejects malformed UUIDs', () => {
                const queryParams: InstanceType<typeof QueryParams> = plainToInstance(QueryParams, {
                    organisationIds: ['not-a-uuid'],
                    rolleIds: ['also-not-a-uuid'],
                });

                const validationErrors: ValidationError[] = validateSync(queryParams);

                expect(validationErrors.map((error: ValidationError) => error.property)).toEqual(
                    expect.arrayContaining(['organisationIds', 'rolleIds']),
                );
            });
        },
    );
});
