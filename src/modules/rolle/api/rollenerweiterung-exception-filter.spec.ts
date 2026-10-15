import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { RollenerweiterungExceptionFilter } from './rollenerweiterung-exception-filter.js';
import { DbiamRollenerweiterungError, RollenerweiterungErrorI18nTypes } from './dbiam-rollenerweiterung.error.js';
import { MissingMerkmalVerfuegbarFuerRollenerweiterungError } from '../domain/missing-merkmal-verfuegbar-fuer-rollenerweiterung.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('RollenerweiterungExceptionFilter', () => {
    let filter: RollenerweiterungExceptionFilter;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    beforeEach(() => {
        filter = new RollenerweiterungExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        it('should map MissingMerkmalVerfuegbarFuerRollenerweiterungError to correct i18nKey', () => {
            const error: MissingMerkmalVerfuegbarFuerRollenerweiterungError =
                new MissingMerkmalVerfuegbarFuerRollenerweiterungError();
            const expected: DbiamRollenerweiterungError = new DbiamRollenerweiterungError({
                code: 400,
                i18nKey: RollenerweiterungErrorI18nTypes.MISSING_MERKMAL_VERFUEGBAR_FUER_ROLLENERWEITERUNG_ERROR,
            });

            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(400);
            expect(responseMock.json).toHaveBeenCalledWith(expected);
        });

        it('should map unknown RollenerweiterungDomainError to generic i18nKey', () => {
            const error: MissingMerkmalVerfuegbarFuerRollenerweiterungError = new Error(
                'unknown',
            ) as unknown as MissingMerkmalVerfuegbarFuerRollenerweiterungError;
            const expected: DbiamRollenerweiterungError = new DbiamRollenerweiterungError({
                code: 500,
                i18nKey: RollenerweiterungErrorI18nTypes.ROLLENERWEITERUNG_ERROR,
            });

            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(500);
            expect(responseMock.json).toHaveBeenCalledWith(expected);
        });
    });
});
