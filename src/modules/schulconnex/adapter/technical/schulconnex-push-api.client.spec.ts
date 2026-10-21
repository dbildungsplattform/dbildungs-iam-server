import { HttpModule, HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { AxiosError, type AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { ConfigTestModule, LoggingTestModule } from '../../../../../test/utils/index.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { SchulconnexPushError } from '../../../../shared/error/index.js';
import { PersonenInfoKontextOrganisationDtoV2 } from '../../api/personinfo/v2/person-info-kontext-organisation.response.v2.js';
import { PersonInfoKontextDtoV2 } from '../../api/personinfo/v2/person-info-kontext.response.v2.js';
import { PersonInfoPersonDtoV2 } from '../../api/personinfo/v2/person-info-person.response.v2.js';
import {
    SchulconnexErreichbarkeitTyp,
    SchulconnexOrganisationTyp,
    SchulconnexPersonenstatus,
    SchulconnexRolle,
} from '../../api/schulconnex-enums.js';
import { SchulconnexPushRegistry } from '../../domain/schulconnex-push-registry.js';
import {
    SchulconnexPushApiTestServer,
    type RecordedPushApiRequest,
} from '../../push-api/testing/schulconnex-push-api-test-server.js';
import { SchulconnexPushApiClient } from './schulconnex-push-api.client.js';

function createRegistry(baseUrl: string): SchulconnexPushRegistry<true> {
    return SchulconnexPushRegistry.construct('registry-1', new Date(), new Date(), 'service-provider-1', baseUrl);
}

function createKontext(overrides: Partial<PersonInfoKontextDtoV2> = {}): PersonInfoKontextDtoV2 {
    return new PersonInfoKontextDtoV2({
        id: 'kontext-1',
        organisation: PersonenInfoKontextOrganisationDtoV2.createNew({
            id: 'schule-1',
            kennung: '123456',
            name: 'Testschule',
            typ: SchulconnexOrganisationTyp.SCHULE,
        }),
        rolle: SchulconnexRolle.LEHR,
        spshRolleId: 'rolle-1',
        erreichbarkeiten: [{ typ: SchulconnexErreichbarkeitTyp.EMAIL, kennung: 'anna@example.org' }],
        personenstatus: SchulconnexPersonenstatus.AKTIV,
        gruppen: [],
        ...overrides,
    });
}

function createAxiosError(status: number): AxiosError {
    return new AxiosError('request failed', AxiosError.ERR_BAD_RESPONSE, undefined, undefined, {
        status,
    } as AxiosResponse);
}

function expectPushError(result: Result<void, unknown>): void {
    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error).toBeInstanceOf(SchulconnexPushError);
}

describe('SchulconnexPushApiClient', () => {
    let module: TestingModule;
    let sut: SchulconnexPushApiClient;
    let httpService: HttpService;
    let loggerMock: ClassLogger;
    let server: SchulconnexPushApiTestServer;
    let registry: SchulconnexPushRegistry<true>;

    beforeAll(async () => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        server = new SchulconnexPushApiTestServer();
        await server.start();
        registry = createRegistry(server.url);

        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, HttpModule],
            providers: [SchulconnexPushApiClient],
        }).compile();

        sut = module.get(SchulconnexPushApiClient);
        httpService = module.get(HttpService);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
        await server.stop();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        server.clearRequests();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
    });

    function singleRequest(): RecordedPushApiRequest {
        const requests: RecordedPushApiRequest[] = server.getRequests();
        expect(requests).toHaveLength(1);

        return requests[0] as RecordedPushApiRequest;
    }

    describe('upsertPerson', () => {
        it('should PUT the person with the person id as referrer', async () => {
            const result: Result<void, unknown> = await sut.upsertPerson(
                registry,
                'person-1',
                new PersonInfoPersonDtoV2({ familienname: 'Test', vorname: 'Anna', familiennamen: 'Test' }),
            );

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('PUT');
            expect(request.path).toBe('/v1/personen/person-1');
            expect(request.body).toEqual({
                referrer: 'person-1',
                name: { familienname: 'Test', vorname: 'Anna' },
            });
        });

        it('should ignore trailing slashes of the registry base url', async () => {
            const result: Result<void, unknown> = await sut.upsertPerson(
                createRegistry(`${server.url}//`),
                'person-1',
                new PersonInfoPersonDtoV2({ familienname: 'Test', vorname: 'Anna', familiennamen: 'Test' }),
            );

            expect(result.ok).toBe(true);
            expect(singleRequest().path).toBe('/v1/personen/person-1');
        });

        it('should encode the person id in the path', async () => {
            await sut.upsertPerson(
                registry,
                'a/b c',
                new PersonInfoPersonDtoV2({ familienname: 'Test', vorname: 'Anna', familiennamen: 'Test' }),
            );

            expect(singleRequest().path).toBe('/v1/personen/a%2Fb%20c');
        });
    });

    describe('deletePerson', () => {
        it('should send a DELETE with an empty payload', async () => {
            const result: Result<void, unknown> = await sut.deletePerson(registry, 'person-1');

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('DELETE');
            expect(request.path).toBe('/v1/personen/person-1');
            expect(request.body).toEqual({});
            expect(request.headers['content-type']).toContain('application/json');
        });
    });

    describe('upsertPersonenkontext', () => {
        it('should PUT the personenkontext with the kontext id as referrer', async () => {
            const result: Result<void, unknown> = await sut.upsertPersonenkontext(
                registry,
                'person-1',
                createKontext(),
            );

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('PUT');
            expect(request.path).toBe('/v1/personen/person-1/personenkontexte/kontext-1');
            expect(request.body).toEqual({
                referrer: 'kontext-1',
                rolle: 'Lehr',
                spshRolleId: 'rolle-1',
                erreichbarkeiten: [{ typ: 'E-Mail', kennung: 'anna@example.org' }],
                personenstatus: 'Aktiv',
                organisation: { id: 'schule-1', kennung: '123456', name: 'Testschule' },
            });
        });

        it('should send a null personenstatus if there is none', async () => {
            await sut.upsertPersonenkontext(registry, 'person-1', createKontext({ personenstatus: undefined }));

            expect((singleRequest().body as { personenstatus: unknown }).personenstatus).toBeNull();
        });

        it.each([
            ['kennung', { kennung: undefined }],
            ['name', { name: undefined }],
        ])(
            'should return an error without sending if the organisation has no %s',
            async (_field: string, orgaOverride: { kennung?: undefined; name?: undefined }) => {
                const result: Result<void, unknown> = await sut.upsertPersonenkontext(
                    registry,
                    'person-1',
                    createKontext({
                        organisation: PersonenInfoKontextOrganisationDtoV2.createNew({
                            id: 'schule-1',
                            kennung: '123456',
                            name: 'Testschule',
                            ...orgaOverride,
                        }),
                    }),
                );

                expectPushError(result);
                expect(server.getRequests()).toHaveLength(0);
            },
        );
    });

    describe('deletePersonenkontext', () => {
        it('should send a DELETE for the personenkontext', async () => {
            const result: Result<void, unknown> = await sut.deletePersonenkontext(registry, 'person-1', 'kontext-1');

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('DELETE');
            expect(request.path).toBe('/v1/personen/person-1/personenkontexte/kontext-1');
        });
    });

    describe('error handling', () => {
        it('should return an error after all attempts if the target is unreachable', async () => {
            const requestSpy: MockInstance = vi.spyOn(httpService, 'request');
            const unreachable: SchulconnexPushRegistry<true> = createRegistry('http://127.0.0.1:1');
            const warnSpy: MockInstance = vi.spyOn(loggerMock, 'logUnknownAsWarning');
            const errorSpy: MockInstance = vi.spyOn(loggerMock, 'logUnknownAsError');

            const result: Result<void, unknown> = await sut.deletePerson(unreachable, 'person-1');

            expectPushError(result);
            expect(requestSpy).toHaveBeenCalledTimes(3);
            expect(warnSpy).toHaveBeenCalledTimes(2);
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it('should not retry on client errors', async () => {
            const requestSpy: MockInstance = vi.spyOn(httpService, 'request');

            const result: Result<void, unknown> = await sut.deletePerson(
                createRegistry(`${server.url}/unknown-prefix`),
                'person-1',
            );

            expectPushError(result);
            expect(requestSpy).toHaveBeenCalledTimes(1);
        });

        it.each([408, 429, 500, 503])('should retry on status %s and succeed afterwards', async (status: number) => {
            const requestSpy: MockInstance = vi
                .spyOn(httpService, 'request')
                .mockReturnValueOnce(throwError(() => createAxiosError(status)));

            const result: Result<void, unknown> = await sut.deletePerson(registry, 'person-1');

            expect(result.ok).toBe(true);
            expect(requestSpy).toHaveBeenCalledTimes(2);
        });

        it.each([400, 404])('should not retry on status %s', async (status: number) => {
            const requestSpy: MockInstance = vi
                .spyOn(httpService, 'request')
                .mockReturnValue(throwError(() => createAxiosError(status)));

            const result: Result<void, unknown> = await sut.deletePerson(registry, 'person-1');

            expect(result.ok).toBe(false);
            expect(requestSpy).toHaveBeenCalledTimes(1);
        });

        it('should retry on non-http errors', async () => {
            const requestSpy: MockInstance = vi
                .spyOn(httpService, 'request')
                .mockReturnValueOnce(throwError(() => new Error('boom')))
                .mockReturnValueOnce(of({} as AxiosResponse));

            const result: Result<void, unknown> = await sut.deletePerson(registry, 'person-1');

            expect(result.ok).toBe(true);
            expect(requestSpy).toHaveBeenCalledTimes(2);
        });
    });
});
