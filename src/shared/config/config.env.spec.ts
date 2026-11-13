import 'reflect-metadata';
import { RollenArt } from '../../modules/rolle/domain/rolle.enums.js';
import configEnv, { type Config } from './config.env.js';

describe('Config Loader', () => {
    const originalEnv: NodeJS.ProcessEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = {};
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('Redis Config', () => {
        it('should load Sentinel configuration from the environment', () => {
            process.env['REDIS_SENTINEL_ENABLED'] = 'true';
            process.env['REDIS_SENTINEL_MASTER_NAME'] = 'test-master';
            process.env['REDIS_SENTINEL_NODES'] = '[{"HOST":"sentinel.example","PORT":26379}]';
            process.env['REDIS_SENTINEL_USERNAME'] = 'sentinel-user';
            process.env['REDIS_SENTINEL_PASSWORD'] = 'sentinel-test-password';
            process.env['REDIS_SENTINEL_USE_TLS'] = 'true';

            const config: Config = configEnv();

            expect(config.REDIS).toMatchObject({
                SENTINEL_ENABLED: true,
                SENTINEL_MASTER_NAME: 'test-master',
                SENTINEL_NODES: [{ HOST: 'sentinel.example', PORT: 26379 }],
                SENTINEL_USERNAME: 'sentinel-user',
                SENTINEL_PASSWORD: 'sentinel-test-password',
                SENTINEL_USE_TLS: true,
            });
        });

        it('should allow explicitly disabling Sentinel', () => {
            process.env['REDIS_SENTINEL_ENABLED'] = 'false';

            const config: Config = configEnv();

            expect(config.REDIS.SENTINEL_ENABLED).toBe(false);
        });

        it('should preserve file configuration when Sentinel environment variables are absent', () => {
            const config: Config = configEnv();

            expect(config.REDIS).toMatchObject({
                SENTINEL_ENABLED: undefined,
                SENTINEL_MASTER_NAME: undefined,
                SENTINEL_NODES: undefined,
                SENTINEL_USE_TLS: undefined,
            });
        });

        it('should ignore an empty endpoint environment variable', () => {
            process.env['REDIS_SENTINEL_NODES'] = '';

            const config: Config = configEnv();

            expect(config.REDIS.SENTINEL_NODES).toBeUndefined();
        });

        it('should preserve explicitly empty Sentinel credentials', () => {
            process.env['REDIS_SENTINEL_USERNAME'] = '';
            process.env['REDIS_SENTINEL_PASSWORD'] = '';

            const config: Config = configEnv();

            expect(config.REDIS).toMatchObject({ SENTINEL_USERNAME: '', SENTINEL_PASSWORD: '' });
        });

        it('should reject malformed endpoint JSON', () => {
            process.env['REDIS_SENTINEL_NODES'] = 'not-json';

            expect(() => configEnv()).toThrow();
        });

        it('should reject an endpoint JSON value that is not an array', () => {
            process.env['REDIS_SENTINEL_NODES'] = '{"HOST":"sentinel.example","PORT":26379}';

            expect(() => configEnv()).toThrow('REDIS_SENTINEL_NODES must be a JSON array');
        });
    });

    describe('System Config', () => {
        it('should load System configuration with parsed integer values', () => {
            process.env['SYSTEM_RENAME_WAITING_TIME_IN_SECONDS'] = '60';
            process.env['SYSTEM_STEP_UP_TIMEOUT_IN_SECONDS'] = '120';
            process.env['SYSTEM_STEP_UP_TIMEOUT_ENABLED'] = 'true';

            const config: Config = configEnv();
            expect(config.SYSTEM).toEqual({
                RENAME_WAITING_TIME_IN_SECONDS: 60,
                STEP_UP_TIMEOUT_IN_SECONDS: 120,
                STEP_UP_TIMEOUT_ENABLED: 'true',
            });
        });

        it('should set undefined for System values if not provided', () => {
            const config: Config = configEnv();
            expect(config.SYSTEM).toEqual({
                RENAME_WAITING_TIME_IN_SECONDS: undefined,
                STEP_UP_TIMEOUT_IN_SECONDS: undefined,
                STEP_UP_TIMEOUT_ENABLED: undefined,
            });
        });
    });

    describe('Import Config', () => {
        it('should load import configuration with parsed integer values', () => {
            process.env['IMPORT_CSV_FILE_MAX_SIZE_IN_MB'] = '10';
            process.env['IMPORT_CSV_MAX_NUMBER_OF_USERS'] = '2001';

            const config: Config = configEnv();
            expect(config.IMPORT).toEqual({
                CSV_FILE_MAX_SIZE_IN_MB: 10,
                CSV_MAX_NUMBER_OF_USERS: 2001,
            });
        });

        it('should set undefined for import values if not provided', () => {
            const config: Config = configEnv();
            expect(config.IMPORT).toEqual({
                CSV_FILE_MAX_SIZE_IN_MB: undefined,
                CSV_MAX_NUMBER_OF_USERS: undefined,
            });
        });

        it('should throw error when integers could not be parsed', () => {
            process.env['IMPORT_CSV_FILE_MAX_SIZE_IN_MB'] = 'string';
            process.env['IMPORT_CSV_MAX_NUMBER_OF_USERS'] = 'string';

            expect(() => configEnv()).toThrow();
        });
    });

    describe('Portal Config', () => {
        it('should load Portal configuration with parsed enum array values', () => {
            process.env['PORTAL_LIMITED_ROLLENART_ALLOWLIST'] = 'LERN,EXTERN';

            const config: Config = configEnv();
            expect(config.PORTAL).toEqual({
                LIMITED_ROLLENART_ALLOWLIST: [RollenArt.LERN, RollenArt.EXTERN],
            });
        });

        it('should filter invalid Portal enum values', () => {
            process.env['PORTAL_LIMITED_ROLLENART_ALLOWLIST'] = 'LERN,INVALID,EXTERN';

            const config: Config = configEnv();
            expect(config.PORTAL).toEqual({
                LIMITED_ROLLENART_ALLOWLIST: [RollenArt.LERN, RollenArt.EXTERN],
            });
        });

        it('should set undefined for Portal values if not provided', () => {
            const config: Config = configEnv();
            expect(config.PORTAL).toEqual({
                LIMITED_ROLLENART_ALLOWLIST: undefined,
            });
        });
    });
});
