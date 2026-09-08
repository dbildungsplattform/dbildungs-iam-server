import { isEnum } from 'class-validator';
import { RollenSystemRechtEnum } from '../domain/systemrecht.js';

export function isRollenSystemRechteArray(value: unknown): value is Array<RollenSystemRechtEnum> {
    const isValid: boolean =
        Array.isArray(value) && value.every((recht: unknown) => isEnum(recht, RollenSystemRechtEnum));

    return isValid;
}

export function toRollenSystemRechteArray(value: unknown): Array<RollenSystemRechtEnum> {
    if (isRollenSystemRechteArray(value)) {
        return value;
    }

    return [];
}
