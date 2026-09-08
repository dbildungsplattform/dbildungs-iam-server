import { vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from 'winston';
import { ConfigTestModule } from '../../../test/utils/index.js';
import { ClassLogger } from './class-logger.js';
import { LoggerModule } from './logger.module.js';
import { ModuleLogger } from './module-logger.js';
import { EntityNotFoundError } from '../../shared/error/entity-not-found.error.js';
import { inspect } from 'util';
import { PersonIdentifier } from './person-identifier.js';
import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../test/utils/createMock.js';

describe('ClassLogger', () => {
    let module: TestingModule;
    let sut: ClassLogger;

    const loggerMock: DeepMocked<Logger> = createMock(Logger);
    const testModuleName: string = 'TestModule';
    const createTestMessage: (message: string, trace?: unknown) => Record<string, unknown> = (
        message: string,
        trace?: unknown,
    ) => ({
        context: `${testModuleName}.${ClassLogger.name}`,
        message,
        trace,
    });

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggerModule.register(testModuleName), ConfigTestModule],
        })
            .overrideProvider(ModuleLogger)
            .useValue({
                getLogger: vi.fn(() => loggerMock),
                get moduleName() {
                    return testModuleName;
                },
            })

            .compile();
        sut = await module.resolve(ClassLogger);
    });

    afterEach(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('when a message is logged', () => {
        const personIdentifier: PersonIdentifier = {
            personId: faker.string.uuid(),
            username: faker.internet.username(),
        };
        it('should log appropriately for level debug', () => {
            sut.debug('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('debug', createTestMessage('Blah'));
        });

        it('should log appropriately for level notice', () => {
            sut.notice('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('notice', createTestMessage('Blah'));
        });

        it('should log appropriately for level info', () => {
            sut.info('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('info', createTestMessage('Blah'));
        });

        it('should log appropriately for level info and extend personIdentifier', () => {
            sut.infoPersonalized('Blah', personIdentifier);

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith(
                'info',
                createTestMessage(`Blah, personId:${personIdentifier.personId}, username:${personIdentifier.username}`),
            );
        });

        it('should log appropriately for level warning', () => {
            sut.warning('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('warning', createTestMessage('Blah'));
        });

        it('should log appropriately for level alert', () => {
            sut.alert('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('alert', createTestMessage('Blah'));
        });

        it('should log appropriately for level error', () => {
            sut.error('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('error', createTestMessage('Blah'));
        });

        it('should log appropriately for level error and extend personIdentifier', () => {
            sut.errorPersonalized('Blah', personIdentifier);

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith(
                'error',
                createTestMessage(`Blah, personId:${personIdentifier.personId}, username:${personIdentifier.username}`),
            );
        });

        it('should log appropriately for level crit', () => {
            sut.crit('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('crit', createTestMessage('Blah'));
        });

        it('should log appropriately for level emerg', () => {
            sut.emerg('Blah');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('emerg', createTestMessage('Blah'));
        });
    });

    describe('when a message with a trace was logged', () => {
        const personIdentifier: PersonIdentifier = {
            personId: faker.string.uuid(),
            username: faker.internet.username(),
        };

        it('should take the trace into account for level debug', () => {
            sut.debug('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('debug', createTestMessage('Blah2', 'TraceInfo'));
        });

        // AI next 40 lines
        it('should take the trace into account for level notice', () => {
            sut.notice('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('notice', createTestMessage('Blah2', 'TraceInfo'));
        });

        it('should take the trace into account for level info', () => {
            sut.info('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('info', createTestMessage('Blah2', 'TraceInfo'));
        });

        it('should take the trace into account for level info and extend personIdentifier', () => {
            sut.infoPersonalized('Blah2', personIdentifier, 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith(
                'info',
                createTestMessage(
                    `Blah2, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
                    'TraceInfo',
                ),
            );
        });

        it('should take the trace into account for level warning', () => {
            sut.warning('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('warning', createTestMessage('Blah2', 'TraceInfo'));
        });

        it('should take the trace into account for level warning and extend personIdentifier', () => {
            sut.warningPersonalized('Blah2', personIdentifier, 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith(
                'warning',
                createTestMessage(
                    `Blah2, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
                    'TraceInfo',
                ),
            );
        });

        it('should take the trace into account for level alert', () => {
            sut.alert('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('alert', createTestMessage('Blah2', 'TraceInfo'));
        });

        it('should take the trace into account for level error', () => {
            sut.error('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('error', createTestMessage('Blah2', 'TraceInfo'));
        });

        it('should take the trace into account for level error and extend personIdentifier', () => {
            sut.errorPersonalized('Blah2', personIdentifier, 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith(
                'error',
                createTestMessage(
                    `Blah2, personId:${personIdentifier.personId}, username:${personIdentifier.username}`,
                    'TraceInfo',
                ),
            );
        });

        it('should take the trace into account for level crit', () => {
            sut.crit('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('crit', createTestMessage('Blah2', 'TraceInfo'));
        });

        it('should take the trace into account for level emerg', () => {
            sut.emerg('Blah2', 'TraceInfo');

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('emerg', createTestMessage('Blah2', 'TraceInfo'));
        });
    });

    describe('infoWithDetails', () => {
        it('should log appropriately for level info', () => {
            sut.infoWithDetails('Blah', { foo: 'bar' });

            expect(loggerMock.log).toHaveBeenCalledTimes(1);
            expect(loggerMock.log).toHaveBeenCalledWith('info', createTestMessage("Blah - { foo: 'bar' }"));
        });
    });

    describe('logUnknownAsError', () => {
        const errorMessage: string = 'error-message';

        describe('when error is UNDEFINED', () => {
            const unknownError: unknown = undefined;

            it('should log warning when error CANNOT be serialized', () => {
                sut.logUnknownAsError(errorMessage, unknownError);

                const createdMsg: { message: string; context: string | undefined; trace?: unknown } = {
                    message: 'Parameter was UNDEFINED when calling instanceOfError',
                    context: 'TestModule.ClassLogger',
                };

                expect(loggerMock.log).toHaveBeenCalledWith('warning', expect.objectContaining(createdMsg));
            });
        });

        describe('when error type is NOT Error', () => {
            const unknownError: unknown = 'I am a string, not an instance of Error';

            it('should call util.inspect(error) for serialization', () => {
                sut.logUnknownAsError(errorMessage, unknownError);

                const createdMsg: { message: string; context: string | undefined; trace?: unknown } = {
                    message:
                        'Type of parameter was String when calling instanceOfError, that may not have been intentional',
                    context: 'TestModule.ClassLogger',
                };
                expect(loggerMock.log).toHaveBeenCalledWith('warning', expect.objectContaining(createdMsg));
                expect(loggerMock.log).toHaveBeenCalledWith(
                    'error',
                    createTestMessage(errorMessage + ' - ' + inspect(unknownError, false, 2, false), undefined),
                );
            });
        });

        describe('when error type is Error', () => {
            const entityNotFoundError: EntityNotFoundError = new EntityNotFoundError();

            it('should get message and stack from Error-instance', () => {
                sut.logUnknownAsError(errorMessage, entityNotFoundError);

                expect(loggerMock.log).toHaveBeenCalledWith(
                    'error',
                    createTestMessage(
                        errorMessage + ' - ' + `${entityNotFoundError.name}: ${entityNotFoundError.message}`,
                        entityNotFoundError.stack,
                    ),
                );
            });

            it('should log cause Error if present', () => {
                const causeError: Error = new Error('Cause error message');
                const resultingError: Error = new Error('Resulting error message', { cause: causeError });

                sut.logUnknownAsError(errorMessage, resultingError);

                expect(loggerMock.log).toHaveBeenCalledWith(
                    'error',
                    createTestMessage(
                        errorMessage +
                            ' - ' +
                            `${resultingError.name}: ${resultingError.message}, cause: (${causeError.name}: ${causeError.message})`,
                        resultingError.stack,
                    ),
                );
            });

            it('should log cause Object if present', () => {
                const causeError: string = 'Cause error message';
                const resultingError: Error = new Error('Resulting error message', { cause: causeError });

                sut.logUnknownAsError(errorMessage, resultingError);

                expect(loggerMock.log).toHaveBeenCalledWith(
                    'error',
                    createTestMessage(
                        errorMessage +
                            ' - ' +
                            `${resultingError.name}: ${resultingError.message}, cause: ('${causeError}')`,
                        resultingError.stack,
                    ),
                );
            });
        });
    });

    describe('logUnknownAsWarning', () => {
        const errorMessage: string = 'error-message';

        describe('when error is UNDEFINED', () => {
            const unknownError: unknown = undefined;

            it('should log warning when error CANNOT be serialized', () => {
                sut.logUnknownAsWarning(errorMessage, unknownError);

                const createdMsg: { message: string; context: string | undefined; trace?: unknown } = {
                    message: 'Parameter was UNDEFINED when calling instanceOfError',
                    context: 'TestModule.ClassLogger',
                };

                expect(loggerMock.log).toHaveBeenCalledWith('warning', expect.objectContaining(createdMsg));
            });
        });

        describe('when error type is NOT Error', () => {
            const unknownError: unknown = 'I am a string, not an instance of Error';

            it('should call util.inspect(error) for serialization', () => {
                sut.logUnknownAsWarning(errorMessage, unknownError);

                const createdMsg: { message: string; context: string | undefined; trace?: unknown } = {
                    message:
                        'Type of parameter was String when calling instanceOfError, that may not have been intentional',
                    context: 'TestModule.ClassLogger',
                };
                expect(loggerMock.log).toHaveBeenCalledWith('warning', expect.objectContaining(createdMsg));
                expect(loggerMock.log).toHaveBeenCalledWith(
                    'warning',
                    createTestMessage(errorMessage + ' - ' + inspect(unknownError, false, 2, false), undefined),
                );
            });
        });

        describe('when error type is Error', () => {
            const entityNotFoundError: EntityNotFoundError = new EntityNotFoundError();

            it('should get message and stack from Error-instance', () => {
                sut.logUnknownAsWarning(errorMessage, entityNotFoundError);

                expect(loggerMock.log).toHaveBeenCalledWith(
                    'warning',
                    createTestMessage(
                        errorMessage + ' - ' + `${entityNotFoundError.message}`,
                        entityNotFoundError.stack,
                    ),
                );
            });
        });
    });
});
