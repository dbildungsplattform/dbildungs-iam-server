import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { HttpModule } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';

import { DoFactory } from '../../../../../../test/utils/do-factory.js';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    LoggingTestModule,
} from '../../../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../../../test/utils/service-provider-test-helper.js';
import { EmailAddressStatus } from '../../../../email/domain/email-address.js';
import { type PersonEmailResponse } from '../../../../person/api/person-email-response.js';
import { type Person } from '../../../../person/domain/person.js';
import { type KontextWithOrgaAndRolle } from '../../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../../../rolle/domain/rolle.enums.js';
import { type ServiceProvider } from '../../../../service-provider/domain/service-provider.js';
import { ServiceProviderEntity } from '../../../../service-provider/repo/service-provider.entity.js';
import { type SchulconnexPushRegistry } from '../../domain/schulconnex-push-registry.js';
import { SchulconnexPushRegistryEntity } from '../../persistence/schulconnex-push-registry.entity.js';
import { SchulconnexPushRegistryRepo } from '../../persistence/schulconnex-push-registry.repo.js';
import {
    SchulconnexPushApiTestServer,
    type RecordedPushApiRequest,
} from '../../testing/schulconnex-push-api-test-server.js';
import { SchulconnexPushApiClient } from '../technical/schulconnex-push-api.client.js';
import { SchulconnexPushAdapter } from './schulconnex-push.adapter.js';

describe('SchulconnexPushAdapter', () => {
    let module: TestingModule;
    let sut: SchulconnexPushAdapter;
    let registryRepo: SchulconnexPushRegistryRepo;
    let orm: MikroORM;
    let em: EntityManager;
    let server: SchulconnexPushApiTestServer;

    beforeAll(async () => {
        vi.spyOn(console, 'info').mockImplementation(() => undefined);
        server = new SchulconnexPushApiTestServer();
        await server.start();

        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                LoggingTestModule,
                HttpModule,
            ],
            providers: [SchulconnexPushAdapter, SchulconnexPushApiClient, SchulconnexPushRegistryRepo],
        }).compile();
        sut = module.get(SchulconnexPushAdapter);
        registryRepo = module.get(SchulconnexPushRegistryRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await orm.close();
        await module.close();
        await server.stop();
        vi.restoreAllMocks();
    });

    beforeEach(async () => {
        server.clearRequests();
        await em.nativeDelete(SchulconnexPushRegistryEntity, {});
    });

    async function persistRegistryPointingToTestServer(): Promise<SchulconnexPushRegistryEntity> {
        const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
        const entity: SchulconnexPushRegistryEntity = em.create(SchulconnexPushRegistryEntity, {
            serviceProvider: em.getReference(ServiceProviderEntity, serviceProvider.id),
            baseUrl: server.url,
        });
        await em.persist(entity).flush();

        return entity;
    }

    async function fetchRegistry(): Promise<SchulconnexPushRegistry<true>> {
        const entity: SchulconnexPushRegistryEntity = await persistRegistryPointingToTestServer();
        const registry: Option<SchulconnexPushRegistry<true>> = await registryRepo.findById(entity.id);
        if (!registry) {
            throw new Error('Registry could not be fetched');
        }

        return registry;
    }

    function singleRequest(): RecordedPushApiRequest {
        const requests: RecordedPushApiRequest[] = server.getRequests();
        expect(requests).toHaveLength(1);

        return requests[0] as RecordedPushApiRequest;
    }

    describe('upsertPerson', () => {
        it('should push the person to the testserver fetched from the registry', async () => {
            const registry: SchulconnexPushRegistry<true> = await fetchRegistry();
            const person: Person<true> = DoFactory.createPerson(true, { vorname: 'Anna', familienname: 'Test' });

            const result: Result<void, unknown> = await sut.upsertPerson(registry, person);

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('PUT');
            expect(request.path).toBe(`/v1/personen/${person.id}`);
            expect(request.body).toEqual({
                referrer: person.id,
                name: { familienname: 'Test', vorname: 'Anna' },
            });
        });
    });

    describe('deletePerson', () => {
        it('should push the person deletion to testserver fetched from the registry', async () => {
            const registry: SchulconnexPushRegistry<true> = await fetchRegistry();
            const personId: string = faker.string.uuid();

            const result: Result<void, unknown> = await sut.deletePerson(registry, personId);

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('DELETE');
            expect(request.path).toBe(`/v1/personen/${personId}`);
            expect(request.body).toEqual({});
        });
    });

    describe('upsertPersonenkontext', () => {
        it('should push the personenkontext to the testserver fetched from the registry', async () => {
            const registry: SchulconnexPushRegistry<true> = await fetchRegistry();
            const personId: string = faker.string.uuid();
            const kontextId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            const orgaId: string = faker.string.uuid();
            const kontext: KontextWithOrgaAndRolle = {
                personenkontext: DoFactory.createPersonenkontext(true, { id: kontextId, personId }),
                organisation: DoFactory.createOrganisation(true, { id: orgaId, kennung: '123456', name: 'Schule' }),
                rolle: DoFactory.createRolle(true, { id: rolleId, rollenart: RollenArt.LEHR }),
            };
            const email: PersonEmailResponse = { address: 'anna@example.org', status: EmailAddressStatus.ENABLED };

            const result: Result<void, unknown> = await sut.upsertPersonenkontext(registry, kontext, [], email);

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('PUT');
            expect(request.path).toBe(`/v1/personen/${personId}/personenkontexte/${kontextId}`);
            expect(request.body).toEqual({
                referrer: kontextId,
                rolle: 'Lehr',
                spshRolleId: rolleId,
                erreichbarkeiten: [{ typ: 'E-Mail', kennung: 'anna@example.org' }],
                personenstatus: 'Aktiv',
                organisation: { id: orgaId, kennung: '123456', name: 'Schule' },
            });
        });
    });

    describe('deletePersonenkontext', () => {
        it('should push the personenkontext deletion to the testserver fetched from the registry', async () => {
            const registry: SchulconnexPushRegistry<true> = await fetchRegistry();
            const personId: string = faker.string.uuid();
            const kontextId: string = faker.string.uuid();

            const result: Result<void, unknown> = await sut.deletePersonenkontext(registry, personId, kontextId);

            expect(result.ok).toBe(true);
            const request: RecordedPushApiRequest = singleRequest();
            expect(request.method).toBe('DELETE');
            expect(request.path).toBe(`/v1/personen/${personId}/personenkontexte/${kontextId}`);
        });
    });
});
