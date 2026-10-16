import { type ArgumentsHost } from '@nestjs/common';
import { type DeepMocked } from '../../../../test/utils/createMock.js';
import { type Response } from 'express';
import { ImportExceptionFilter } from './import-exception-filter.js';
import { DbiamImportError, ImportErrorI18nTypes } from './dbiam-import.error.js';
import { ImportDomainError } from '../domain/import-domain.error.js';

describe('ImportExceptionFilter', () => {
    let filter: ImportExceptionFilter;
    const statusCode: number = 500;
    let responseMock: DeepMocked<Response>;
    let argumentsHost: DeepMocked<ArgumentsHost>;

    const generalBadRequestError: DbiamImportError = new DbiamImportError({
        code: 500,
        i18nKey: ImportErrorI18nTypes.IMPORT_ERROR,
    });

    beforeEach(() => {
        filter = new ImportExceptionFilter();
        responseMock = { status: vi.fn(), json: vi.fn() } as unknown as DeepMocked<Response>;
        argumentsHost = {
            switchToHttp: () => ({
                getRequest: vi.fn(),
                getResponse: vi.fn().mockReturnValue(responseMock),
                getNext: vi.fn(),
            }),
        } as unknown as DeepMocked<ArgumentsHost>;
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general ImportError', () => {
                const error: ImportDomainError = new ImportDomainError('error', undefined);

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });
    });
});
