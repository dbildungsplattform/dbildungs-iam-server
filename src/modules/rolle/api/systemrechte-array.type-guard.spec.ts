import { RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { isRollenSystemRechteArray, toRollenSystemRechteArray } from './systemrechte-array.type-guard.js';

describe('isRollenSystemRechteArray', () => {
    it('should return true for an empty array', () => {
        expect(isRollenSystemRechteArray([])).toBe(true);
    });

    it('should return true for an array of valid enum values', () => {
        expect(
            isRollenSystemRechteArray([RollenSystemRechtEnum.ROLLEN_VERWALTEN, RollenSystemRechtEnum.ROLLEN_ERWEITERN]),
        ).toBe(true);
    });

    it('should return true for an array with a single valid enum value', () => {
        expect(isRollenSystemRechteArray([RollenSystemRechtEnum.IMPORT_DURCHFUEHREN])).toBe(true);
    });

    it('should return false for undefined', () => {
        expect(isRollenSystemRechteArray(undefined)).toBe(false);
    });

    it('should return false for null', () => {
        expect(isRollenSystemRechteArray(null)).toBe(false);
    });

    it('should return false for a string', () => {
        expect(isRollenSystemRechteArray('ROLLEN_VERWALTEN')).toBe(false);
    });

    it('should return false for a number', () => {
        expect(isRollenSystemRechteArray(42)).toBe(false);
    });

    it('should return false for a plain object', () => {
        expect(isRollenSystemRechteArray({ systemrechte: [RollenSystemRechtEnum.ROLLEN_VERWALTEN] })).toBe(false);
    });

    it('should return false for an array containing an invalid string', () => {
        expect(isRollenSystemRechteArray(['NOT_A_VALID_RECHT'])).toBe(false);
    });

    it('should return false for an array mixing valid and invalid values', () => {
        expect(isRollenSystemRechteArray([RollenSystemRechtEnum.ROLLEN_VERWALTEN, 'INVALID'])).toBe(false);
    });

    it('should return false for an array containing numbers', () => {
        expect(isRollenSystemRechteArray([1, 2, 3])).toBe(false);
    });
});

describe('toRollenSystemRechteArray', () => {
    it('should return the same array for a valid RollenSystemRechtEnum array', () => {
        const input: RollenSystemRechtEnum[] = [
            RollenSystemRechtEnum.ROLLEN_VERWALTEN,
            RollenSystemRechtEnum.ROLLEN_ERWEITERN,
        ];
        expect(toRollenSystemRechteArray(input)).toBe(input);
    });

    it('should return an empty array for an empty array', () => {
        const input: RollenSystemRechtEnum[] = [];
        expect(toRollenSystemRechteArray(input)).toStrictEqual([]);
    });

    it('should return an empty array for undefined', () => {
        expect(toRollenSystemRechteArray(undefined)).toStrictEqual([]);
    });

    it('should return an empty array for null', () => {
        expect(toRollenSystemRechteArray(null)).toStrictEqual([]);
    });

    it('should return an empty array for a string', () => {
        expect(toRollenSystemRechteArray('ROLLEN_VERWALTEN')).toStrictEqual([]);
    });

    it('should return an empty array for an array with invalid values', () => {
        expect(toRollenSystemRechteArray(['NOT_A_VALID_RECHT'])).toStrictEqual([]);
    });

    it('should return an empty array for an array mixing valid and invalid values', () => {
        expect(toRollenSystemRechteArray([RollenSystemRechtEnum.ROLLEN_VERWALTEN, 'INVALID'])).toStrictEqual([]);
    });
});
