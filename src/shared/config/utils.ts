import { isEnum } from 'class-validator';
import { EnvToBooleanError } from './errors/env-to-boolean.error.js';
import { EnvToIntegerError } from './errors/env-to-integer.error.js';

/**
 * Reads the environment variable and returns an optional boolean.
 * Depending on the input:
 * - undefined or empty string -> undefined
 * - "true" (case insensitive) -> true
 * - "false" (case insensitive) -> false
 * - any other string -> throws error
 *
 * @param key The name of the environment variable
 */
export function envToOptionalBoolean(key: string): boolean | undefined {
    const value: string | undefined = process.env[key];

    if (!value) {
        return undefined;
    }

    const lower: string | undefined = value.toLowerCase();

    switch (lower) {
        case 'true':
            return true;
        case 'false':
            return false;
        default:
            throw new EnvToBooleanError(key, value);
    }
}

/**
 * Reads the environment variable and returns an optional integer.
 * Depending on the input:
 * - undefined or empty string -> undefined
 * - <any valid integer> -> number
 * - string that can't be parsed to an integer -> throws error
 *
 * @param key The name of the environment variable
 */
export function envToOptionalInteger(key: string): number | undefined {
    const value: string | undefined = process.env[key];

    if (!value) {
        return undefined;
    }

    const parsed: number = parseInt(value, 10);

    if (isNaN(parsed)) {
        throw new EnvToIntegerError(key, value);
    }

    return parsed;
}

/**
 *  Reads the environment variable and returns an array of strings.
 * Depending on the input:
 * - undefined or empty string -> undefined
 * - comma-separated string -> array of trimmed strings
 * @param key
 * @returns array of strings or undefined if the environment variable is not set or empty
 */
export function envToStringArray(key: string): string[] | undefined {
    const value: string | undefined = process.env[key];
    if (!value) {
        return undefined;
    }

    return value.split(',').map((item: string) => item.trim());
}

export function envToEnumArray<TEnum extends string>(
    key: string,
    enumObject: Record<string, TEnum>,
): TEnum[] | undefined {
    return envToStringArray(key)?.filter((value: string): value is TEnum => isEnum(value, enumObject));
}
