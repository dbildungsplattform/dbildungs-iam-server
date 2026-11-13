import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { RedisConfig } from './redis.config.js';

const sentinelConfig: Record<string, unknown> = {
    SENTINEL_ENABLED: true,
    SENTINEL_MASTER_NAME: 'test-master',
    SENTINEL_NODES: [{ HOST: 'sentinel.example', PORT: 26379 }],
};

function validateConfig(overrides: Record<string, unknown> = {}): ValidationError[] {
    const config: RedisConfig = plainToInstance(RedisConfig, {
        HOST: 'localhost',
        PORT: 6379,
        USERNAME: 'default',
        PASSWORD: 'test-password',
        USE_TLS: false,
        ...overrides,
    });

    return validateSync(config, {
        skipMissingProperties: false,
        whitelist: true,
        forbidUnknownValues: true,
    });
}

describe('RedisConfig', () => {
    describe('standalone configuration', () => {
        it('should preserve standalone configuration without Sentinel settings', () => {
            const errors: ValidationError[] = validateConfig();

            expect(errors).toEqual([]);
        });

        it.each(['HOST', 'PORT'])('should require %s without Sentinel', (property: string) => {
            const errors: ValidationError[] = validateConfig({ [property]: undefined, SENTINEL_ENABLED: false });

            expect(errors.some((error: ValidationError) => error.property === property)).toBe(true);
        });

        it.each([1024, 10000])('should preserve the supported Redis port %i', (port: number) => {
            const errors: ValidationError[] = validateConfig({ PORT: port });

            expect(errors).toEqual([]);
        });

        it.each([1023, 10001, 6379.5])('should reject invalid TCP port %s', (port: number) => {
            const errors: ValidationError[] = validateConfig({ PORT: port });

            expect(errors.some((error: ValidationError) => error.property === 'PORT')).toBe(true);
        });
    });

    describe('Sentinel configuration', () => {
        it('should accept Sentinel without a static host or port', () => {
            const errors: ValidationError[] = validateConfig({
                ...sentinelConfig,
                HOST: undefined,
                PORT: undefined,
            });

            expect(errors).toEqual([]);
        });

        it.each(['SENTINEL_MASTER_NAME', 'SENTINEL_NODES'])(
            'should require %s when Sentinel is enabled',
            (property: string) => {
                const errors: ValidationError[] = validateConfig({ ...sentinelConfig, [property]: undefined });

                expect(errors.some((error: ValidationError) => error.property === property)).toBe(true);
            },
        );

        it('should reject an empty master name', () => {
            const errors: ValidationError[] = validateConfig({ ...sentinelConfig, SENTINEL_MASTER_NAME: '' });

            expect(errors.some((error: ValidationError) => error.property === 'SENTINEL_MASTER_NAME')).toBe(true);
        });

        it('should reject an empty endpoint list', () => {
            const errors: ValidationError[] = validateConfig({ ...sentinelConfig, SENTINEL_NODES: [] });

            expect(errors.some((error: ValidationError) => error.property === 'SENTINEL_NODES')).toBe(true);
        });

        it.each([
            { HOST: '', PORT: 26379 },
            { HOST: 'sentinel.example', PORT: 0 },
            { HOST: 'sentinel.example', PORT: 65536 },
            { HOST: 'sentinel.example', PORT: '26379' },
            { HOST: 'sentinel.example' },
        ])('should reject an invalid Sentinel endpoint %j', (node: Record<string, unknown>) => {
            const errors: ValidationError[] = validateConfig({ ...sentinelConfig, SENTINEL_NODES: [node] });

            expect(errors.some((error: ValidationError) => error.property === 'SENTINEL_NODES')).toBe(true);
        });

        it('should accept optional Sentinel credentials and TLS', () => {
            const errors: ValidationError[] = validateConfig({
                ...sentinelConfig,
                SENTINEL_USERNAME: 'sentinel-user',
                SENTINEL_PASSWORD: 'sentinel-test-password',
                SENTINEL_USE_TLS: true,
            });

            expect(errors).toEqual([]);
        });

        it('should accept explicitly unauthenticated Sentinel connections', () => {
            const errors: ValidationError[] = validateConfig({
                ...sentinelConfig,
                SENTINEL_USERNAME: '',
                SENTINEL_PASSWORD: '',
            });

            expect(errors).toEqual([]);
        });

        it('should reject a non-boolean Sentinel flag', () => {
            const errors: ValidationError[] = validateConfig({ SENTINEL_ENABLED: 'true' });

            expect(errors.some((error: ValidationError) => error.property === 'SENTINEL_ENABLED')).toBe(true);
        });
    });
});
