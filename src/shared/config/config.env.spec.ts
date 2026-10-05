import { RollenArt } from '../../modules/rolle/domain/rolle.enums.js';
import configEnv, { Config } from './config.env.js';

describe('Config Loader', () => {
    beforeEach(() => {
        vi.resetModules();
        process.env = {};
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
