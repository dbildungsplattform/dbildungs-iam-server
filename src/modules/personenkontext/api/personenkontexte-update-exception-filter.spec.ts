import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { PersonenkontexteUpdateExceptionFilter } from './personenkontexte-update-exception-filter.js';
import {
    DbiamPersonenkontexteUpdateError,
    PersonenkontexteUpdateErrorI18nTypes,
} from './dbiam-personenkontexte-update.error.js';
import { PersonenkontexteUpdateError } from '../domain/error/personenkontexte-update.error.js';
import { createArgumentsHostMock, createResponseMock } from '../../../../test/utils/http.mocks.js';
import { type MockedObject } from 'vitest';

describe('PersonenkontexteUpdateExceptionFilter', () => {
    let filter: PersonenkontexteUpdateExceptionFilter;
    const statusCode: number = 400;
    let responseMock: MockedObject<Response>;
    let argumentsHost: MockedObject<ArgumentsHost>;

    const generalBadRequestError: DbiamPersonenkontexteUpdateError = new DbiamPersonenkontexteUpdateError({
        code: 500,
        i18nKey: PersonenkontexteUpdateErrorI18nTypes.PERSONENKONTEXTE_UPDATE_ERROR,
    });

    beforeEach(() => {
        filter = new PersonenkontexteUpdateExceptionFilter();
        responseMock = createResponseMock();
        argumentsHost = createArgumentsHostMock({ response: responseMock });
    });

    describe('catch', () => {
        describe('when filter catches undefined error', () => {
            it('should throw a general PersonenkontexteUpdateError', () => {
                const error: PersonenkontexteUpdateError = new PersonenkontexteUpdateError('error');

                filter.catch(error, argumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalBadRequestError);
            });
        });
    });
});
