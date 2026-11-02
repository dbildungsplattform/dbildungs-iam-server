import { Test, type TestingModule } from '@nestjs/testing';

import { createMock, type DeepMocked } from '../../../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../../../test/utils/do-factory.js';
import { type DomainError, SchulconnexPushError } from '../../../../../shared/error/index.js';
import { EmailAddressStatus } from '../../../../email/domain/email-address.js';
import { UserLock } from '../../../../keycloak-administration/domain/user-lock.js';
import { type PersonEmailResponse } from '../../../../person/api/person-email-response.js';
import { type Person } from '../../../../person/domain/person.js';
import { type KontextWithOrgaAndRolle } from '../../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../../rolle/domain/rolle.enums.js';
import { SchulconnexPushRegistry } from '../../domain/schulconnex-push-registry.js';
import { SchulconnexPushApiClient } from '../technical/schulconnex-push-api.client.js';
import { SchulconnexPushAdapter } from './schulconnex-push.adapter.js';

describe('SchulconnexPushAdapter', () => {
    let module: TestingModule;
    let sut: SchulconnexPushAdapter;
    let clientMock: DeepMocked<SchulconnexPushApiClient>;

    const registry: SchulconnexPushRegistry<true> = SchulconnexPushRegistry.construct(
        'registry-1',
        new Date(),
        new Date(),
        'service-provider-1',
        'http://localhost',
    );

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                SchulconnexPushAdapter,
                { provide: SchulconnexPushApiClient, useValue: createMock(SchulconnexPushApiClient) },
            ],
        }).compile();

        sut = module.get(SchulconnexPushAdapter);
        clientMock = module.get(SchulconnexPushApiClient);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('upsertPerson', () => {
        it('should map the person and delegate to the client', async () => {
            const person: Person<true> = DoFactory.createPerson(true, { vorname: 'Anna', familienname: 'Test' });
            clientMock.upsertPerson.mockResolvedValueOnce({ ok: true, value: undefined });

            const result: Result<void, unknown> = await sut.upsertPerson(registry, person);

            expect(result.ok).toBe(true);
            expect(clientMock.upsertPerson).toHaveBeenCalledWith(registry, person.id, expect.anything());
            expect(clientMock.upsertPerson.mock.calls[0]?.[2]).toMatchObject({
                name: { familienname: 'Test', vorname: 'Anna' },
            });
        });
    });

    describe('deletePerson', () => {
        it('should delegate to the client and return its result', async () => {
            const error: Result<void, DomainError> = { ok: false, error: new SchulconnexPushError('failed') };
            clientMock.deletePerson.mockResolvedValueOnce(error);

            const result: Result<void, unknown> = await sut.deletePerson(registry, 'person-1');

            expect(result).toBe(error);
            expect(clientMock.deletePerson).toHaveBeenCalledWith(registry, 'person-1');
        });
    });

    describe('upsertPersonenkontext', () => {
        it('should map the kontext and delegate to the client', async () => {
            const kontext: KontextWithOrgaAndRolle = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'kontext-1', personId: 'person-1' }),
                organisation: DoFactory.createOrganisation(true, { id: 'schule-1', kennung: '123456', name: 'Schule' }),
                rolle: DoFactory.createRolle(true, { id: 'rolle-1', rollenart: RollenArt.LEHR }),
            };
            const email: PersonEmailResponse = { address: 'anna@example.org', status: EmailAddressStatus.ENABLED };
            clientMock.upsertPersonenkontext.mockResolvedValueOnce({ ok: true, value: undefined });

            const result: Result<void, unknown> = await sut.upsertPersonenkontext(registry, kontext, [], email);

            expect(result.ok).toBe(true);
            expect(clientMock.upsertPersonenkontext).toHaveBeenCalledWith(
                registry,
                'person-1',
                expect.objectContaining({
                    id: 'kontext-1',
                    rolle: 'Lehr',
                    spshRolleId: 'rolle-1',
                    erreichbarkeiten: [{ typ: 'E-Mail', kennung: 'anna@example.org' }],
                    personenstatus: 'Aktiv',
                    gruppen: [],
                }),
            );
        });

        it('should pass user locks and a missing email to the mapper', async () => {
            const kontext: KontextWithOrgaAndRolle = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: 'kontext-1', personId: 'person-1' }),
                organisation: DoFactory.createOrganisation(true),
                rolle: DoFactory.createRolle(true, { rollenart: RollenArt.LERN }),
            };
            clientMock.upsertPersonenkontext.mockResolvedValueOnce({ ok: true, value: undefined });

            await sut.upsertPersonenkontext(registry, kontext, [createMock(UserLock)], null);

            expect(clientMock.upsertPersonenkontext).toHaveBeenCalledWith(
                registry,
                'person-1',
                expect.objectContaining({ erreichbarkeiten: [], personenstatus: undefined }),
            );
        });
    });

    describe('deletePersonenkontext', () => {
        it('should delegate to the client', async () => {
            clientMock.deletePersonenkontext.mockResolvedValueOnce({ ok: true, value: undefined });

            const result: Result<void, unknown> = await sut.deletePersonenkontext(registry, 'person-1', 'kontext-1');

            expect(result.ok).toBe(true);
            expect(clientMock.deletePersonenkontext).toHaveBeenCalledWith(registry, 'person-1', 'kontext-1');
        });
    });
});
