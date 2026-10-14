import { IsIn, ValidationOptions } from 'class-validator';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { RollenmerkmalSystemrechtPaar } from '../domain/rollenmerkmal-systemrecht-paar.js';

export function IsSystemrechtForRollenAdministration(validationOptions?: ValidationOptions): PropertyDecorator {
    return IsIn(
        [
            RollenSystemRechtEnum.ROLLEN_VERWALTEN,
            RollenSystemRechtEnum.ROLLEN_ERWEITERN,
            RollenSystemRechtEnum.IMPORT_DURCHFUEHREN,
            ...RollenmerkmalSystemrechtPaar.GATED_SYSTEMRECHTE.map(
                (systemrecht: RollenSystemRecht) => systemrecht.name,
            ),
        ],
        {
            each: true,
            ...validationOptions,
        },
    );
}
