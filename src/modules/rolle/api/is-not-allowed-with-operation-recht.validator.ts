import {
    registerDecorator,
    ValidationArguments,
    ValidationOptions,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from 'class-validator';
import { RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { FIND_ALL_ROLLEN_OPERATION_RECHTE } from './find-all-rollen-operation-rechte.constant.js';
import { toRollenSystemRechteArray } from './systemrechte-array.type-guard.js';

@ValidatorConstraint({ name: 'isNotAllowedWithOperationRecht', async: false })
export class IsNotAllowedWithOperationRechtConstraint implements ValidatorConstraintInterface {
    public validate(value: unknown, args: ValidationArguments): boolean {
        const systemrechte: unknown = 'systemrechte' in args.object ? args.object.systemrechte : undefined;
        const isOperationRecht: boolean = toRollenSystemRechteArray(systemrechte).some((r: RollenSystemRechtEnum) =>
            FIND_ALL_ROLLEN_OPERATION_RECHTE.includes(r),
        );

        const isValueUndefined: boolean = value === undefined;
        const isValueEmptyArray: boolean = Array.isArray(value) && value.length === 0;
        const isValid: boolean = !isOperationRecht || isValueUndefined || isValueEmptyArray;

        return isValid;
    }

    public defaultMessage(): string {
        return 'organisationenForFilter cannot be used with ROLLEN_ERWEITERN or IMPORT_DURCHFUEHREN. Use organisationContextForOperation instead.';
    }
}

export function IsNotAllowedWithOperationRecht(validationOptions?: ValidationOptions): PropertyDecorator {
    return function (object: object, propertyName: string | symbol): void {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName as string,
            options: validationOptions,
            constraints: [],
            validator: IsNotAllowedWithOperationRechtConstraint,
        });
    };
}
