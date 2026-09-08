import { ValidationArguments } from 'class-validator';
import { RollenSystemRechtEnum } from '../domain/systemrecht.js';
import {
    IsOnlyAllowedWithOperationRecht,
    IsOnlyAllowedWithOperationRechtConstraint,
} from './is-only-allowed-with-workflow-recht.validator.js';

function makeArgs(value: unknown, object: object = {}): ValidationArguments {
    return {
        value,
        constraints: [],
        targetName: 'TestClass',
        object,
        property: 'organisationIdContextForOperation',
    };
}

describe('IsOnlyAllowedWithOperationRechtConstraint', () => {
    describe('validate', () => {
        it('should return true when systemrechte contains ROLLEN_ERWEITERN and value is a non-empty array', () => {
            const constraint: IsOnlyAllowedWithOperationRechtConstraint =
                new IsOnlyAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: [RollenSystemRechtEnum.ROLLEN_ERWEITERN] }),
                ),
            ).toBe(true);
        });

        it('should return true when systemrechte contains IMPORT_DURCHFUEHREN and value is anything', () => {
            const constraint: IsOnlyAllowedWithOperationRechtConstraint =
                new IsOnlyAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: [RollenSystemRechtEnum.IMPORT_DURCHFUEHREN] }),
                ),
            ).toBe(true);
        });

        it('should return true when systemrechte has no operation rights and value is undefined', () => {
            const constraint: IsOnlyAllowedWithOperationRechtConstraint =
                new IsOnlyAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    undefined,
                    makeArgs(undefined, { systemrechte: [RollenSystemRechtEnum.ROLLEN_VERWALTEN] }),
                ),
            ).toBe(true);
        });

        it('should return false when systemrechte has no operation rights and value is a non-empty array', () => {
            const constraint: IsOnlyAllowedWithOperationRechtConstraint =
                new IsOnlyAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: [RollenSystemRechtEnum.ROLLEN_VERWALTEN] }),
                ),
            ).toBe(false);
        });

        it('should return false when systemrechte is not an array and value is non-undefined', () => {
            const constraint: IsOnlyAllowedWithOperationRechtConstraint =
                new IsOnlyAllowedWithOperationRechtConstraint();
            expect(
                constraint.validate(
                    ['some-id'],
                    makeArgs(['some-id'], { systemrechte: RollenSystemRechtEnum.ROLLEN_ERWEITERN }),
                ),
            ).toBe(false);
        });

        it('should return true when systemrechte is absent and value is undefined', () => {
            const constraint: IsOnlyAllowedWithOperationRechtConstraint =
                new IsOnlyAllowedWithOperationRechtConstraint();
            expect(constraint.validate(undefined, makeArgs(undefined, {}))).toBe(true);
        });
    });

    describe('defaultMessage', () => {
        it('should return the expected error message', () => {
            const constraint: IsOnlyAllowedWithOperationRechtConstraint =
                new IsOnlyAllowedWithOperationRechtConstraint();
            expect(constraint.defaultMessage()).toBe(
                'organisationContextForOperation can only be used with ROLLEN_ERWEITERN or IMPORT_DURCHFUEHREN. Use organisationenForFilter instead.',
            );
        });
    });
});

describe('IsOnlyAllowedWithOperationRecht', () => {
    it('should register the decorator constraint on the target property', () => {
        class TestDto {
            @IsOnlyAllowedWithOperationRecht()
            public organisationIdContextForOperation?: string;
        }

        const instance: TestDto = new TestDto();
        expect(instance).toBeInstanceOf(TestDto);
    });
});
