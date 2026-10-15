import { type ArgumentsHost } from '@nestjs/common';
import { type Response } from 'express';
import { SchulConnexError } from '../../../shared/error/schul-connex.error.js';
import { SchulConnexSharedErrorFilter } from './schulconnex-shared-error-filter.js';
import {
    EntityCouldNotBeCreated,
    EntityCouldNotBeDeleted,
    EntityCouldNotBeUpdated,
    EntityNotFoundError,
    KeycloakClientError,
    MismatchedRevisionError,
    SharedDomainError,
} from '../../../shared/error/index.js';

type HttpArgumentsHost = ReturnType<ArgumentsHost['switchToHttp']>;

describe('SharedErrorFilter', () => {
    let filter: SchulConnexSharedErrorFilter;
    const statusCode: number = 500;
    let responseMock: Partial<Response>;
    let argumentsHost: Partial<ArgumentsHost>;

    const generalSharedError: SchulConnexError = new SchulConnexError({
        code: statusCode,
        subcode: '00',
        titel: 'Interner Serverfehler',
        beschreibung: 'Es ist ein interner Fehler aufgetreten. Der aufgetretene Fehler konnte nicht verarbeitet werden',
    });

    const entityCouldNotBeCreatedError: SchulConnexError = new SchulConnexError({
        code: 500,
        subcode: '00',
        titel: 'Interner Serverfehler',
        beschreibung: 'Es ist ein interner Fehler aufgetreten. Entität konnte nicht erstellt werden.',
    });

    const entityCouldNotBeUpdatedError: SchulConnexError = new SchulConnexError({
        code: 500,
        subcode: '00',
        titel: 'Interner Serverfehler',
        beschreibung: 'Es ist ein interner Fehler aufgetreten. Entität konnte nicht aktualisiert werden.',
    });

    const entityCouldNotBeDeletedError: SchulConnexError = new SchulConnexError({
        code: 500,
        subcode: '00',
        titel: 'Interner Serverfehler',
        beschreibung: 'Es ist ein interner Fehler aufgetreten. Entität konnte nicht gelöscht werden.',
    });

    const entityNotFoundError: SchulConnexError = new SchulConnexError({
        code: 404,
        subcode: '01',
        titel: 'Angefragte Entität existiert nicht',
        beschreibung: 'Die angeforderte Entität existiert nicht',
    });

    const keycloakClientError: SchulConnexError = new SchulConnexError({
        code: 500,
        subcode: '00',
        titel: 'Interner Serverfehler',
        beschreibung: 'Es ist ein interner Fehler aufgetreten. Ein Keycloak Fehler ist aufgetreten.',
    });

    const mismatchedRevisionError: SchulConnexError = new SchulConnexError({
        code: 409,
        subcode: '00',
        titel: 'Konflikt mit dem aktuellen Zustand der Resource',
        beschreibung: 'Die Entität wurde eventuell durch Dritte verändert. Die Revisionsnummer stimmt nicht überein.',
    });

    beforeEach(() => {
        filter = new SchulConnexSharedErrorFilter();
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
        };
    });

    describe('catch', () => {
        describe('when filter catches undefined domain error', () => {
            it('should throw a general schulconnex exception', () => {
                const domainError: SharedDomainError = new SharedDomainError('Interner Serverfehler', undefined);

                filter.catch(domainError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(statusCode);
                expect(responseMock.json).toHaveBeenCalledWith(generalSharedError);
            });
        });

        describe('when filter catches an entityCouldNotBeCreatedError error', () => {
            it('should throw a shared schulconnex exception', () => {
                const domainError: EntityCouldNotBeCreated = new EntityCouldNotBeCreated(
                    'Entität konnte nicht erstellt werden',
                );
                filter.catch(domainError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(entityCouldNotBeCreatedError.code);
                expect(responseMock.json).toHaveBeenCalledWith(entityCouldNotBeCreatedError);
            });
        });

        describe('when filter catches an entityCouldNotBeUpdatedError error', () => {
            it('should throw a shared schulconnex exception', () => {
                const domainError: EntityCouldNotBeUpdated = new EntityCouldNotBeUpdated(
                    'Entität konnte nicht erstellt werden',
                    '00',
                );
                filter.catch(domainError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(entityCouldNotBeUpdatedError.code);
                expect(responseMock.json).toHaveBeenCalledWith(entityCouldNotBeUpdatedError);
            });
        });

        describe('when filter catches an entityCouldNotBeDeletedError error', () => {
            it('should throw a shared schulconnex exception', () => {
                const domainError: EntityCouldNotBeDeleted = new EntityCouldNotBeDeleted(
                    'Entität konnte nicht gelöscht werden',
                    '00',
                );
                filter.catch(domainError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(entityCouldNotBeDeletedError.code);
                expect(responseMock.json).toHaveBeenCalledWith(entityCouldNotBeDeletedError);
            });
        });

        describe('when filter catches an entityNotFoundError error', () => {
            it('should throw a shared schulconnex exception', () => {
                const domainError: EntityNotFoundError = new EntityNotFoundError(
                    'Entität konnte nicht gefunden werden',
                );
                filter.catch(domainError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(entityNotFoundError.code);
                expect(responseMock.json).toHaveBeenCalledWith(entityNotFoundError);
            });
        });

        describe('when filter catches an keycloakClientError error', () => {
            it('should throw a shared schulconnex exception', () => {
                const domainError: KeycloakClientError = new KeycloakClientError(
                    'Keycloak Client Fehler ist aufgetreten',
                );
                filter.catch(domainError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(keycloakClientError.code);
                expect(responseMock.json).toHaveBeenCalledWith(keycloakClientError);
            });
        });

        describe('when filter catches an mismatchedRevisionError error', () => {
            it('should throw a shared schulconnex exception', () => {
                const domainError: MismatchedRevisionError = new MismatchedRevisionError(
                    'Entität konnte nicht erstellt werden',
                );
                filter.catch(domainError, argumentsHost as ArgumentsHost);

                expect(responseMock.json).toHaveBeenCalled();
                expect(responseMock.status).toHaveBeenCalledWith(mismatchedRevisionError.code);
                expect(responseMock.json).toHaveBeenCalledWith(mismatchedRevisionError);
            });
        });
    });
});
