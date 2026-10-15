import { Test, type TestingModule } from '@nestjs/testing';
import { LoggingModule } from './logging.module.js';
import { LoggerService } from './logger.service.js';
import { ConsoleLoggerService } from './console-logger.service.js';

describe('LoggingModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when LoggingModule is initialized', () => {
        it('should resolve LoggerService', () => {
            const service: LoggerService = module.get(LoggerService);
            expect(service).toBeInstanceOf(ConsoleLoggerService);
        });
    });
});
