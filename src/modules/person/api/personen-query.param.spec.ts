import { faker } from '@faker-js/faker';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import 'reflect-metadata';
import { SichtfreigabeType } from '../../personenkontext/domain/personenkontext.enums.js';
import { PersonLockOccasion } from '../domain/person.enums.js';
import { PersonenQueryParams } from './personen-query.param.js';

describe('PersonenQueryParam', () => {
    const referenceParams: PersonenQueryParams = {
        sichtfreigabe: SichtfreigabeType.JA,
        familienname: faker.person.lastName(),
        username: 'username',
        vorname: faker.person.firstName(),
        suchFilter: '',
    };

    it('should convert a plain object to a class of PersonenQueryParam', () => {
        const incomingParams: object = {
            sichtfreigabe: referenceParams.sichtfreigabe,
            familienname: referenceParams.familienname,
            username: referenceParams.username,
            vorname: referenceParams.vorname,
            suchFilter: referenceParams.suchFilter,
        };
        const mappedParams: PersonenQueryParams = plainToInstance(PersonenQueryParams, incomingParams, {});

        expect(mappedParams).toBeInstanceOf(PersonenQueryParams);
        expect(mappedParams).toEqual(referenceParams);
    });

    describe('sperrgruende', () => {
        it.each([
            { input: undefined, expected: undefined },
            { input: [], expected: [] },
            { input: PersonLockOccasion.MANUELL_GESPERRT, expected: [PersonLockOccasion.MANUELL_GESPERRT] },
            {
                input: [PersonLockOccasion.MANUELL_GESPERRT, PersonLockOccasion.KOPERS_GESPERRT],
                expected: [PersonLockOccasion.MANUELL_GESPERRT, PersonLockOccasion.KOPERS_GESPERRT],
            },
        ])(
            'should accept and transform $input',
            async ({
                input,
                expected,
            }: {
                input: PersonLockOccasion | PersonLockOccasion[] | undefined;
                expected: PersonLockOccasion[] | undefined;
            }) => {
                const params: PersonenQueryParams = plainToInstance(
                    PersonenQueryParams,
                    input === undefined ? {} : { sperrgruende: input },
                );

                expect(await validate(params)).toEqual([]);
                expect(params.sperrgruende).toEqual(expected);
            },
        );

        it.each([
            ['AKTIV'],
            [PersonLockOccasion.MANUELL_GESPERRT, 'INVALID'],
            [PersonLockOccasion.MANUELL_GESPERRT, PersonLockOccasion.MANUELL_GESPERRT],
        ])('should reject invalid or duplicate reasons: %j', async (...sperrgruende: string[]) => {
            const params: PersonenQueryParams = plainToInstance(PersonenQueryParams, { sperrgruende });

            const errors: ValidationError[] = await validate(params);

            expect(errors).toHaveLength(1);
            expect(errors[0]?.property).toBe('sperrgruende');
        });
    });
});
