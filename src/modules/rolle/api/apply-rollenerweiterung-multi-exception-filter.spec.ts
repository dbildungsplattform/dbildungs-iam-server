import { ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import { ApplyRollenerweiterungMultiExceptionFilter } from './apply-rollenerweiterung-multi-exception-filter.js';
import { ApplyRollenerweiterungError } from './apply-rollenerweiterung.error.js';
import {
    DbiamApplyRollenerweiterungMultiError,
    DbiamApplyRollenerweiterungMultiErrorI18NTypes,
} from './dbiam-apply-rollenerweiterung-multi.error.js';
import { EntityNotFoundError } from '../../../shared/error/index.js';
import { NoRedundantRollenerweiterungError } from '../specification/error/no-redundant-rollenerweiterung.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { MockedObject } from 'vitest';
import { faker } from '@faker-js/faker';

describe('ApplyRollenerweiterungMultiExceptionFilter', () => {
    let filter: ApplyRollenerweiterungMultiExceptionFilter;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    beforeEach(() => {
        filter = new ApplyRollenerweiterungMultiExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        it('should map EntityNotFoundError to NOT_FOUND i18nKey', () => {
            const rolleId: string = faker.string.uuid();
            const error: ApplyRollenerweiterungError = new ApplyRollenerweiterungError([
                { id: rolleId, error: new EntityNotFoundError('rolle') },
            ]);
            const expected: DbiamApplyRollenerweiterungMultiError = new DbiamApplyRollenerweiterungMultiError({
                code: 400,
                idsWithI18nKeys: [{ id: rolleId, i18nKey: DbiamApplyRollenerweiterungMultiErrorI18NTypes.NOT_FOUND }],
            });

            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(400);
            expect(responseMock.json).toHaveBeenCalledWith(expected);
        });

        it('should map NoRedundantRollenerweiterungError to NO_REDUNDANT_ROLLENERWEITERUNG i18nKey', () => {
            const rolleId: string = faker.string.uuid();
            const error: ApplyRollenerweiterungError = new ApplyRollenerweiterungError([
                { id: rolleId, error: new NoRedundantRollenerweiterungError() },
            ]);
            const expected: DbiamApplyRollenerweiterungMultiError = new DbiamApplyRollenerweiterungMultiError({
                code: 400,
                idsWithI18nKeys: [
                    {
                        id: rolleId,
                        i18nKey: DbiamApplyRollenerweiterungMultiErrorI18NTypes.NO_REDUNDANT_ROLLENERWEITERUNG,
                    },
                ],
            });

            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(400);
            expect(responseMock.json).toHaveBeenCalledWith(expected);
        });

        it('should map unknown error to ROLLENERWEITERUNG_TECHNICAL_ERROR i18nKey', () => {
            const rolleId: string = faker.string.uuid();
            const error: ApplyRollenerweiterungError = new ApplyRollenerweiterungError([
                { id: rolleId, error: new Error() as unknown as NoRedundantRollenerweiterungError },
            ]);
            const expected: DbiamApplyRollenerweiterungMultiError = new DbiamApplyRollenerweiterungMultiError({
                code: 400,
                idsWithI18nKeys: [
                    {
                        id: rolleId,
                        i18nKey: DbiamApplyRollenerweiterungMultiErrorI18NTypes.ROLLENERWEITERUNG_TECHNICAL_ERROR,
                    },
                ],
            });

            filter.catch(error, argumentsHost);

            expect(responseMock.status).toHaveBeenCalledWith(400);
            expect(responseMock.json).toHaveBeenCalledWith(expected);
        });
    });
});
