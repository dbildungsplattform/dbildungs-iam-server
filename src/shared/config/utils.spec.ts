import { envToEnumArray, envToOptionalBoolean, envToOptionalInteger, envToStringArray } from './utils.js';

const TEST_KEY: string = 'CONFIG_UTIL_TEST_KEY';

enum TestConfigEnum {
    FOO = 'FOO',
    BAR = 'BAR',
    BAZ = 'BAZ',
}

describe('Config Utils', () => {
    describe('envToOptionalBoolean', () => {
        it.each([
            ['', undefined],
            ['true', true],
            ['TRUE', true],
            ['false', false],
            ['FALSE', false],
        ])(
            'when environment variable is "%s", should return %s',
            (input: string | undefined, expected: boolean | undefined) => {
                process.env[TEST_KEY] = input;

                expect(envToOptionalBoolean(TEST_KEY)).toBe(expected);
            },
        );

        it('should throw error, if the environment variable is set to an invalid string', () => {
            process.env[TEST_KEY] = 'INVALID';

            expect(() => envToOptionalBoolean(TEST_KEY)).toThrow();
        });
    });

    describe('envToOptionalInteger', () => {
        it.each([
            ['', undefined],
            ['0', 0],
            ['15', 15],
            ['-15', -15],
        ])(
            'when environment variable is "%s", should return %s',
            (input: string | undefined, expected: number | undefined) => {
                process.env[TEST_KEY] = input;

                expect(envToOptionalInteger(TEST_KEY)).toBe(expected);
            },
        );

        it('should throw error, if the environment variable is set to an invalid number', () => {
            process.env[TEST_KEY] = 'INVALID';

            expect(() => envToOptionalInteger(TEST_KEY)).toThrow();
        });
    });

    describe('envToStringArray', () => {
        it.each([
            ['', undefined],
            ['a,b,c', ['a', 'b', 'c']],
            ['a, b, c', ['a', 'b', 'c']],
        ])(
            'when environment variable is "%s", should return %s',
            (input: string | undefined, expected: string[] | undefined) => {
                process.env[TEST_KEY] = input;

                expect(envToStringArray(TEST_KEY)).toEqual(expected);
            },
        );

        it('should return undefined if the environment variable is not set', () => {
            delete process.env[TEST_KEY];

            expect(envToStringArray(TEST_KEY)).toBeUndefined();
        });
    });

    describe('envToEnumArray', () => {
        it.each([
            ['', undefined],
            ['FOO,BAR', [TestConfigEnum.FOO, TestConfigEnum.BAR]],
            ['FOO, BAR, BAZ', [TestConfigEnum.FOO, TestConfigEnum.BAR, TestConfigEnum.BAZ]],
            ['FOO,INVALID,BAR', [TestConfigEnum.FOO, TestConfigEnum.BAR]],
            ['INVALID,UNKNOWN', []],
        ])(
            'when environment variable is "%s", should return %s',
            (input: string | undefined, expected: TestConfigEnum[] | undefined) => {
                process.env[TEST_KEY] = input;

                expect(envToEnumArray(TEST_KEY, TestConfigEnum)).toEqual(expected);
            },
        );

        it('should return undefined if the environment variable is not set', () => {
            delete process.env[TEST_KEY];

            expect(envToEnumArray(TEST_KEY, TestConfigEnum)).toBeUndefined();
        });
    });
});
