import { IsIn, ValidationOptions } from 'class-validator';
import { RollenSystemRechtEnum } from '../domain/systemrecht.js';

export function IsSystemrechtForRollenAdministration(validationOptions?: ValidationOptions): PropertyDecorator {
    return IsIn(
        [
            RollenSystemRechtEnum.ROLLEN_VERWALTEN,
            RollenSystemRechtEnum.ROLLEN_ERWEITERN,
            RollenSystemRechtEnum.IMPORT_DURCHFUEHREN,
            RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN,
        ],
        {
            each: true,
            ...validationOptions,
        },
    );
}
