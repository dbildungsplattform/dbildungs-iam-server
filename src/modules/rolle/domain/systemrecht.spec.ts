import { RollenmerkmalSystemrechtPaar } from './rollenmerkmal-systemrecht-paar.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from './systemrecht.js';

describe('RollenSystemRecht', () => {
    it.each([
        RollenSystemRechtEnum.PILOT_1_ROLLEN_ZUORDNEN,
        RollenSystemRechtEnum.PILOT_2_ROLLEN_ZUORDNEN,
        RollenSystemRechtEnum.PILOT_3_ROLLEN_ZUORDNEN,
        RollenSystemRechtEnum.PILOT_4_ROLLEN_ZUORDNEN,
        RollenSystemRechtEnum.PILOT_5_ROLLEN_ZUORDNEN,
        RollenSystemRechtEnum.BEHOERDEN_VERWALTEN,
    ])('should expose %s as an administrable system right', (name: RollenSystemRechtEnum) => {
        const result: RollenSystemRecht = RollenSystemRecht.getByName(name);

        expect(result.technical).toBe(false);
        expect(RollenSystemRecht.ALL).toContain(result);
    });

    describe('getByName', () => {
        it.each(Object.values(RollenSystemRechtEnum))(
            'should return a RollenSystemRecht by name',
            (name: RollenSystemRechtEnum) => {
                const result: RollenSystemRecht = RollenSystemRecht.getByName(name);
                expect(result).toBeDefined();
                expect(result.name).toBe(name);
            },
        );
    });
});

describe('RollenmerkmalSystemrechtPaar', () => {
    describe('isGatedSystemrecht', () => {
        it.each([
            { systemrecht: RollenSystemRecht.MPT_ROLLEN_ZUORDNEN, expected: true },
            { systemrecht: RollenSystemRecht.PILOT_1_ROLLEN_ZUORDNEN, expected: true },
            { systemrecht: RollenSystemRecht.PILOT_2_ROLLEN_ZUORDNEN, expected: true },
            { systemrecht: RollenSystemRecht.PILOT_3_ROLLEN_ZUORDNEN, expected: true },
            { systemrecht: RollenSystemRecht.PILOT_4_ROLLEN_ZUORDNEN, expected: true },
            { systemrecht: RollenSystemRecht.PILOT_5_ROLLEN_ZUORDNEN, expected: true },
            { systemrecht: RollenSystemRecht.ROLLEN_VERWALTEN, expected: false },
        ])(
            'should return $expected for $systemrecht.name',
            ({ systemrecht, expected }: { systemrecht: RollenSystemRecht; expected: boolean }) => {
                const result: boolean = RollenmerkmalSystemrechtPaar.isGatedSystemrecht(systemrecht);

                expect(result).toBe(expected);
            },
        );
    });
});
