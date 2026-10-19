import { StreamableFile } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Readable } from 'stream';

import { ClassLogger } from '../../core/logging/class-logger.js';
import { StreamableFileFactory } from './streamable-file.factory.js';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';

describe('StreamableFileFactory', () => {
    let module: TestingModule;
    let sut: StreamableFileFactory;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                StreamableFileFactory,
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
            ],
        }).compile();

        sut = await module.resolve(StreamableFileFactory);
        loggerMock = await module.resolve(ClassLogger);
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

    describe('fromBuffer', () => {
        it('should return file', () => {
            const file: StreamableFile = sut.fromBuffer(Buffer.from(''), {});

            expect(file).toBeInstanceOf(StreamableFile);
        });

        it('should info-log on closed stream', () => {
            const err: NodeJS.ErrnoException = new Error();
            err.code = 'ERR_STREAM_PREMATURE_CLOSE';
            const file: StreamableFile = sut.fromBuffer(Buffer.from(''), {});

            file.errorLogger(err);

            expect(loggerMock.info).toHaveBeenCalledWith(err.message, err.stack);
        });

        it('should error-log', () => {
            const err: NodeJS.ErrnoException = new Error('other-error');
            const file: StreamableFile = sut.fromBuffer(Buffer.from(''), {});

            file.errorLogger(err);

            expect(loggerMock.error).toHaveBeenCalledWith(err.message, err.stack);
        });
    });

    describe('fromReadable', () => {
        it('should return file', () => {
            const file: StreamableFile = sut.fromReadable(Readable.from(''), {});

            expect(file).toBeInstanceOf(StreamableFile);
        });

        it('should info-log on closed stream', () => {
            const err: NodeJS.ErrnoException = new Error();
            err.code = 'ERR_STREAM_PREMATURE_CLOSE';
            const file: StreamableFile = sut.fromReadable(Readable.from(''), {});

            file.errorLogger(err);

            expect(loggerMock.info).toHaveBeenCalledWith(err.message, err.stack);
        });

        it('should error-log', () => {
            const err: NodeJS.ErrnoException = new Error('other-error');
            const file: StreamableFile = sut.fromReadable(Readable.from(''), {});

            file.errorLogger(err);

            expect(loggerMock.error).toHaveBeenCalledWith(err.message, err.stack);
        });
    });
});
