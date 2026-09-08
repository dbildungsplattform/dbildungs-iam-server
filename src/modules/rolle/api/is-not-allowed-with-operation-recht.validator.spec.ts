import { ValidationArguments } from 'class-validator';
import { RollenSystemRechtEnum } from '../domain/systemrecht.js';
import {
    IsNotAllowedWithOperationRecht,
    IsNotAllowedWithOperationRechtConstraint,
} from './is-not-allowed-with-operation-recht.validator.js';

function makeArgs(value: unknown, object: object = {}): ValidationArguments {
    return {
        value,
        constraints: [],
        targetName: 'TestClass',
        object,
        property: 'organisationIdsForFilter',
    };
}

describe('IsNotAllowedWithOperationRechtConstraint', () => {
    describe('validate', () => {
        it('should return true when systemrechte is absent from args.object', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(constraint.validate(['some-id'], makeArgs(['some-id'], {}))).toBe(true);
        });

        it('should return true when systemrechte is not an array', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: RollenSystemRechtEnum.ROLLEN_ERWEITERN }),
                ),
            ).toBe(true);
        });

        it('should return true when systemrechte contains only non-operation rights', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: [RollenSystemRechtEnum.ROLLEN_VERWALTEN] }),
                ),
            ).toBe(true);
        });

        it('should return true when systemrechte contains ROLLEN_ERWEITERN and value is undefined', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    undefined,
                    makeArgs(undefined, { systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN] }),
                ),
            ).toBe(true);
        });

        it('should return true when systemrechte contains ROLLEN_ERWEITERN and value is an empty array', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate([], makeArgs([], { systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN] })),
            ).toBe(true);
        });

        it('should return true when systemrechte contains IMPORT_DURCHFUEHREN and value is undefined', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    undefined,
                    makeArgs(undefined, { systemrechte: [RollenSystemRechtEnum.IMPORT_DURCHFUEHREN] }),
                ),
            ).toBe(true);
        });

        it('should return false when systemrechte contains ROLLEN_ERWEITERN and value is a non-empty array', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN] }),
                ),
            ).toBe(false);
        });

        it('should return false when systemrechte contains IMPORT_DURCHFUEHREN and value is a non-empty array', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: [RollenSystemRechtEnum.IMPORT_DURCHFUEHREN] }),
                ),
            ).toBe(false);
        });
    });

    describe('defaultMessage', () => {
        it('should return the expected error message', () => {
            const constraint: IsNotAllowedWithOperationRechtConstraint = new IsNotAllowedWithOperationRechtConstraint();
            expect(constraint.defaultMessage()).toBe(
                'organisationenForFilter cannot be used with ROLLEN_ERWEITERN or IMPORT_DURCHFUEHREN. Use organisationContextForOperation instead.',
            );
        });
    });
});

describe('IsNotAllowedWithOperationRecht', () => {
    it('should register the decorator constraint on the target property', () => {
        class TestDto {
            @IsNotAllowedWithOperationRecht()
            public organisationIdsForFilter?: string[];
        }

        const instance: TestDto = new TestDto();
        expect(instance).toBeInstanceOf(TestDto);
    });
});
