import { Test, type TestingModule } from '@nestjs/testing';
import { ConsoleLoggerService } from './console-logger.service.js';
import { type Mock } from 'vitest';
import { type LoggerService } from './index.js';

describe('ConsoleLoggerService', () => {
    let module: TestingModule;
    let sut: LoggerService;

    const traceSpy: Mock = vi.spyOn(console, 'trace').mockImplementation(() => {});
    const debugSpy: Mock = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logSpy: Mock = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy: Mock = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy: Mock = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy: Mock = vi.spyOn(console, 'error').mockImplementation(() => {});

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [ConsoleLoggerService],
        }).compile();
        sut = module.get(ConsoleLoggerService);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('trace', () => {
        describe('when receiving a message', () => {
            it('should write to console', () => {
                expect(() => sut.trace('trace')).not.toThrow();
                expect(traceSpy).toBeCalledWith('trace');
            });
        });
    });

    describe('debug', () => {
        describe('when receiving a message', () => {
            it('should write to console', () => {
                expect(() => sut.debug('debug')).not.toThrow();
                expect(debugSpy).toHaveBeenCalledWith('debug');
            });
        });
    });

    describe('log', () => {
        describe('when receiving a message', () => {
            it('should write to console', () => {
                expect(() => sut.log('log')).not.toThrow();
                expect(logSpy).toHaveBeenCalledWith('log');
            });
        });
    });

    describe('info', () => {
        describe('when receiving a message', () => {
            it('should write to console', () => {
                expect(() => sut.info('info')).not.toThrow();
                expect(infoSpy).toHaveBeenCalledWith('info');
            });
        });
    });

    describe('warn', () => {
        describe('when receiving a message', () => {
            it('should write to console', () => {
                expect(() => sut.warn('warn')).not.toThrow();
                expect(warnSpy).toHaveBeenCalledWith('warn');
            });
        });
    });

    describe('error', () => {
        describe('when receiving a message', () => {
            it('should write to console', () => {
                expect(() => sut.error('error')).not.toThrow();
                expect(errorSpy).toHaveBeenCalledWith('error');
            });
        });
    });
});
