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

@ValidatorConstraint({ name: 'isOnlyAllowedWithOperationRecht', async: false })
export class IsOnlyAllowedWithOperationRechtConstraint implements ValidatorConstraintInterface {
    public validate(value: unknown, args: ValidationArguments): boolean {
        const systemrechte: unknown = 'systemrechte' in args.object ? args.object.systemrechte : undefined;
        const isOperationRecht: boolean = toRollenSystemRechteArray(systemrechte).some((r: RollenSystemRechtEnum) =>
            FIND_ALL_ROLLEN_OPERATION_RECHTE.includes(r),
        );

        const isValid: boolean = isOperationRecht || value === undefined;

        return isValid;
    }

    public defaultMessage(): string {
        return 'organisationContextForOperation can only be used with ROLLEN_ERWEITERN or IMPORT_DURCHFUEHREN. Use organisationenForFilter instead.';
    }
}

export function IsOnlyAllowedWithOperationRecht(validationOptions?: ValidationOptions): PropertyDecorator {
    return function (object: object, propertyName: string | symbol): void {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName as string,
            options: validationOptions,
            constraints: [],
            validator: IsOnlyAllowedWithOperationRechtConstraint,
        });
    };
}
