import { ArrayContains, IsIn } from 'class-validator';

import { RollenmerkmalSystemrechtPaar } from '../../domain/rollenmerkmal-systemrecht-paar.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../domain/systemrecht.js';

export function IsSystemrechtAndGatedSystemrechte(requiredSystemrecht: RollenSystemRechtEnum): PropertyDecorator {
    const allowedSystemrechte: RollenSystemRechtEnum[] = [
        requiredSystemrecht,
        ...RollenmerkmalSystemrechtPaar.GATED_SYSTEMRECHTE.map((systemrecht: RollenSystemRecht) => systemrecht.name),
    ];

    return (target: object, propertyKey: string | symbol): void => {
        ArrayContains([requiredSystemrecht])(target, propertyKey);
        IsIn(allowedSystemrechte, { each: true })(target, propertyKey);
    };
}
