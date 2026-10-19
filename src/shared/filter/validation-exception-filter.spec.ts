import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { type ValidationError } from 'class-validator';
import { DbiamValidationError, ValidationErrorI18nTypes } from '../validation/dbiam-validation.error.js';
import { ValidationExceptionFilter } from './validation-exception-filter.js';
import { DetailedValidationError } from '../validation/detailed-validation.error.js';

type HttpArgumentsHost = ReturnType<ArgumentsHost['switchToHttp']>;

describe('SchulconnexValidationErrorFilter', () => {
    let filter: ValidationExceptionFilter;
    const statusCode: number = 400;
    let responseMock: Partial<Response>;
    let argumentsHost: Partial<ArgumentsHost>;

    const generalValidationError: DbiamValidationError = new DbiamValidationError({
        code: statusCode,
        i18nKey: ValidationErrorI18nTypes.VALIDATION_ERROR,
    });

    const isNotEmptyError: DbiamValidationError = new DbiamValidationError({
        code: statusCode,
        i18nKey: ValidationErrorI18nTypes.REQUIRED_VALUE,
    });

    const invalidLengthError: DbiamValidationError = new DbiamValidationError({
        code: statusCode,
        i18nKey: ValidationErrorI18nTypes.INVALID_LENGTH,
    });

    const datumError: DbiamValidationError = new DbiamValidationError({
        code: statusCode,
        i18nKey: ValidationErrorI18nTypes.INVALID_DATE,
    });

    const enumError: DbiamValidationError = new DbiamValidationError({
        code: statusCode,
        i18nKey: ValidationErrorI18nTypes.INVALID_ENUM,
    });

    beforeEach(() => {
        filter = new ValidationExceptionFilter();
        responseMock = {
            setHeader: vi.fn().mockReturnThis(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        };

        const httpArgumentsHostMock: Partial<HttpArgumentsHost> = {
            getResponse: vi.fn().mockReturnValue(responseMock),
            getRequest: vi.fn().mockReturnValue({}),
        };

        argumentsHost = {
            switchToHttp: vi.fn().mockReturnValue(httpArgumentsHostMock),
            getHandler: vi.fn().mockReturnValue(() => {}),
            getClass: vi.fn().mockReturnValue(class {}),
        } as unknown as ArgumentsHost;
    });

    describe('catch', () => {
        describe('when filter catches undefined validation error', () => {
            it('should throw a general schulconnex exception', () => {
                const detailedValidationError: DetailedValidationError = new DetailedValidationError([]);

                filter.catch(detailedValidationError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalValidationError);
            });
        });

        describe('when filter catches a is not empty validation error ', () => {
            it('should throw a is not empty exception', () => {
                const validationError: ValidationError = {
                    property: 'fieldName',
                    constraints: {
                        isNotEmpty: 'Property should not be empty',
                    },
                };
                const detailedValidationError: DetailedValidationError = new DetailedValidationError([validationError]);

                filter.catch(detailedValidationError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(isNotEmptyError);
            });
        });

        describe('when filter catches an invalid value validation error', () => {
            it('should throw an invalid lenght exception', () => {
                const validationError: ValidationError = {
                    property: 'fieldName',
                    constraints: {
                        isMinLength: 'Text length is invalid',
                    },
                };
                const detailedValidationError: DetailedValidationError = new DetailedValidationError([validationError]);

                filter.catch(detailedValidationError, argumentsHost as ArgumentsHost);

                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(invalidLengthError);
            });
        });

        describe('when filter catches an invalid date value validation error', () => {
            it('should throw an invalid date exception', () => {
                const validationError: ValidationError = {
                    property: 'fieldName',
                    constraints: {
                        isDate: 'Date value is invalid',
                    },
                };
                const detailedValidationError: DetailedValidationError = new DetailedValidationError([validationError]);

                filter.catch(detailedValidationError, argumentsHost as ArgumentsHost);

                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(datumError);
            });
        });

        describe('when filter catches an invalid enum value validation error', () => {
            it('should throw a invalid enum exception', () => {
                const validationError: ValidationError = {
                    property: 'fieldName',
                    constraints: {
                        isEnum: 'value does not match with enum',
                    },
                };
                const detailedValidationError: DetailedValidationError = new DetailedValidationError([validationError]);

                filter.catch(detailedValidationError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(enumError);
            });
        });

        describe('when filter catches a validation error that has a child validation error', () => {
            it('should throw a child validation schulconnex exception', () => {
                const validationError: ValidationError = {
                    property: 'fieldName',
                    constraints: {
                        isEnum: 'enum is invalid',
                    },
                    children: [
                        {
                            property: 'fieldName',
                            constraints: {
                                isEmail: 'value of mail is invalid',
                            },
                            children: [
                                {
                                    property: 'fieldName',
                                    constraints: {
                                        isString: 'value of enum should be a string',
                                    },
                                },
                            ],
                        },
                    ],
                };
                const detailedValidationError: DetailedValidationError = new DetailedValidationError([validationError]);

                filter.catch(detailedValidationError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalValidationError);
            });
        });

        describe('when filter catches a validation error without constraints', () => {
            it('should throw a general bad bad request exception', () => {
                const validationError: ValidationError = {
                    property: 'fieldName',
                };
                const detailedValidationError: DetailedValidationError = new DetailedValidationError([validationError]);

                filter.catch(detailedValidationError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalValidationError);
            });
        });
    });
});
