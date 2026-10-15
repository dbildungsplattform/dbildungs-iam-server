import { Test, type TestingModule } from '@nestjs/testing';
import { ModuleLogger } from './module-logger.js';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { NestLogger } from './nest-logger.js';
import { type Logger } from 'winston';

class LoggerMock {
    public logs: Array<{ level: string; message: unknown }> = [];

    public log(level: string, message: unknown): void {
        this.logs.push({ level, message });
    }
    public info(message: unknown): void {
        this.logs.push({ level: 'info', message });
    }
    public error(message: unknown): void {
        this.logs.push({ level: 'error', message });
    }
    public debug(message: unknown): void {
        this.logs.push({ level: 'debug', message });
    }
}

describe('The nest Logger', () => {
    let module: TestingModule;
    let moduleLogger: DeepMocked<ModuleLogger>;

    beforeAll(async () => {
        moduleLogger = createMock(ModuleLogger);
        moduleLogger.getLogger.mockReturnValue(createMock<LoggerMock>(LoggerMock) as unknown as Logger);
        module = await Test.createTestingModule({
            providers: [{ provide: ModuleLogger, useValue: moduleLogger }, NestLogger],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    describe('when a message gets logged', () => {
        it('should produce correct log messages with level log', () => {
            const nestLogger: NestLogger = module.get(NestLogger);

            nestLogger.log('Test');

            expect(moduleLogger.getLogger).toHaveBeenCalled();
            expect(
                (moduleLogger.getLogger() as DeepMocked<Logger>).log.mock.calls.every(
                    (v: [level: string, message: unknown]): boolean => v[0] === 'log',
                ),
            );
        });

        it('should produce correct log messages with level debug', () => {
            const nestLogger: NestLogger = module.get(NestLogger);

            nestLogger.debug?.('Test');

            expect(moduleLogger.getLogger).toHaveBeenCalled();
            expect(
                (moduleLogger.getLogger() as DeepMocked<Logger>).log.mock.calls.every(
                    (v: [level: string, message: unknown]): boolean => v[0] === 'debug',
                ),
            );
        });

        it('should produce correct log messages with level error', () => {
            const nestLogger: NestLogger = module.get(NestLogger);

            nestLogger.error('Test');

            expect(moduleLogger.getLogger).toHaveBeenCalled();
            expect(
                (moduleLogger.getLogger() as DeepMocked<Logger>).log.mock.calls.every(
                    (v: [level: string, message: unknown]): boolean => v[0] === 'error',
                ),
            );
        });

        it('should produce correct log messages with level warn', () => {
            const nestLogger: NestLogger = module.get(NestLogger);

            nestLogger.warn('Test');

            expect(moduleLogger.getLogger).toHaveBeenCalled();
            expect(
                (moduleLogger.getLogger() as DeepMocked<Logger>).log.mock.calls.every(
                    (v: [level: string, message: unknown]): boolean => v[0] === 'warn',
                ),
            );
        });

        it('should produce correct log messages with level verbose', () => {
            const nestLogger: NestLogger = module.get(NestLogger);

            nestLogger.verbose?.('Test');

            expect(moduleLogger.getLogger).toHaveBeenCalled();
            expect(
                (moduleLogger.getLogger() as DeepMocked<Logger>).log.mock.calls.every(
                    (v: [level: string, message: unknown]): boolean => v[1] === 'verbose',
                ),
            );
        });
    });
});
