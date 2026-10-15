import { localFormatter } from './module-logger.js';
import { createMock } from '../../../test/utils/createMock.js';
import type winston from 'winston';

class TransformableInfoMock {
    [key: string]: unknown;
    public level: string = 'info';
    public message: unknown;
}

describe('Module Logger', () => {
    describe('when a log message is produced', () => {
        let tfi: winston.Logform.TransformableInfo;

        beforeEach(() => {
            tfi = createMock(TransformableInfoMock) as winston.Logform.TransformableInfo;
            tfi.level = 'info';
        });

        it('should produce a sensible log message', () => {
            tfi.level = 'error';
            tfi.message = 'Something bad happened';
            const formattedMessage: string = localFormatter(tfi);

            expect(formattedMessage).toContain('Something bad happened');
            expect(formattedMessage).toContain('error');
        });

        it('should honor its context', () => {
            tfi['context'] = 'contxt';
            expect(localFormatter(tfi)).toContain('contxt');
        });

        it('should show its timestamp', () => {
            tfi['timestamp'] = '11:10:09';
            expect(localFormatter(tfi)).toContain('11:10:09');
        });

        it('should show its ms', () => {
            tfi['ms'] = '12432';
            expect(localFormatter(tfi)).toContain('12432');
        });

        it('should show a trace message', () => {
            tfi['trace'] = 'AN IMPORTANT TRACE';
            expect(localFormatter(tfi)).toContain('AN IMPORTANT TRACE');
        });
    });
});
