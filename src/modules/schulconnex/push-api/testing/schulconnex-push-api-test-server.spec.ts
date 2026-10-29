import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchulconnexPushApiTestServer, type RecordedPushApiRequest } from './schulconnex-push-api-test-server.js';

describe('SchulconnexPushApiTestServer', () => {
    let sut: SchulconnexPushApiTestServer;

    beforeAll(async () => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        sut = new SchulconnexPushApiTestServer();
        await sut.start();
    });

    afterAll(async () => {
        await sut.stop();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        sut.clearRequests();
    });

    async function readRequests(): Promise<RecordedPushApiRequest[]> {
        const response: Response = await fetch(`${sut.url}${SchulconnexPushApiTestServer.INSPECTION_PATH}`);
        return (await response.json()) as RecordedPushApiRequest[];
    }

    describe('lifecycle', () => {
        it('should throw when started twice', async () => {
            await expect(sut.start()).rejects.toThrow('already running');
        });

        it('should reject when the port is already in use', async () => {
            const other: SchulconnexPushApiTestServer = new SchulconnexPushApiTestServer();

            await expect(other.start(sut.port)).rejects.toThrow();
        });

        it('should throw when reading the port while not running', () => {
            const other: SchulconnexPushApiTestServer = new SchulconnexPushApiTestServer();

            expect(() => other.port).toThrow('not running');
        });

        it('should do nothing when stopping a server that is not running', async () => {
            const other: SchulconnexPushApiTestServer = new SchulconnexPushApiTestServer();

            await expect(other.stop()).resolves.toBeUndefined();
        });
    });

    describe.each([
        ['PUT', '/v1/personen/p1', { personId: 'p1' }, { name: 'x' }],
        ['DELETE', '/v1/personen/p1', { personId: 'p1' }, { reason: 'y' }],
        ['PUT', '/v1/personen/p1/personenkontexte/k1', { personId: 'p1', personenkontextId: 'k1' }, { a: 1 }],
        ['DELETE', '/v1/personen/p1/personenkontexte/k1', { personId: 'p1', personenkontextId: 'k1' }, undefined],
    ])('%s %s', (method: string, path: string, params: Record<string, string>, body: unknown) => {
        it('should answer 202 and record the request', async () => {
            const response: Response = await fetch(`${sut.url}${path}?foo=bar`, {
                method,
                headers: body === undefined ? {} : { 'content-type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
            });

            const requests: RecordedPushApiRequest[] = await readRequests();

            expect(response.status).toBe(202);
            expect(requests).toHaveLength(1);
            expect(requests[0]).toMatchObject({ method, path, params, query: { foo: 'bar' } });
            expect(requests[0]?.body).toEqual(body);
            expect(sut.getRequests()).toHaveLength(1);
        });
    });

    describe('invalid json', () => {
        it('should answer 400 and not record the request', async () => {
            const response: Response = await fetch(`${sut.url}/v1/personen/p1`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: '{invalid',
            });

            expect(response.status).toBe(400);
            expect(await readRequests()).toHaveLength(0);
        });
    });

    describe('non-syntax body errors', () => {
        it('should not treat an oversized body as invalid json', async () => {
            const response: Response = await fetch(`${sut.url}/v1/personen/p1`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ data: 'x'.repeat(200_000) }),
            });

            expect(response.status).toBe(413);
            expect(await readRequests()).toHaveLength(0);
        });
    });

    describe('inspection endpoints', () => {
        it('should return requests in order of arrival', async () => {
            await fetch(`${sut.url}/v1/personen/first`, { method: 'DELETE' });
            await fetch(`${sut.url}/v1/personen/second`, { method: 'DELETE' });

            const requests: RecordedPushApiRequest[] = await readRequests();

            expect(requests.map((r: RecordedPushApiRequest) => r.params['personId'])).toEqual(['first', 'second']);
        });

        it('should clear requests on DELETE', async () => {
            await fetch(`${sut.url}/v1/personen/p1`, { method: 'DELETE' });

            const response: Response = await fetch(`${sut.url}${SchulconnexPushApiTestServer.INSPECTION_PATH}`, {
                method: 'DELETE',
            });

            expect(response.status).toBe(204);
            expect(await readRequests()).toHaveLength(0);
        });
    });
});
