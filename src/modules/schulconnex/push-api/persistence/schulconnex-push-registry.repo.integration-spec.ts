import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Test, type TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
} from '../../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../../test/utils/service-provider-test-helper.js';
import type { ServiceProvider } from '../../../service-provider/domain/service-provider.js';
import { ServiceProviderEntity } from '../../../service-provider/repo/service-provider.entity.js';
import type { SchulconnexPushRegistry } from '../domain/schulconnex-push-registry.js';
import { SchulconnexPushRegistryEntity } from './schulconnex-push-registry.entity.js';
import { SchulconnexPushRegistryRepo } from './schulconnex-push-registry.repo.js';

describe('SchulconnexPushRegistryRepo', () => {
    let module: TestingModule;
    let sut: SchulconnexPushRegistryRepo;
    let orm: MikroORM;
    let em: EntityManager;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true })],
            providers: [SchulconnexPushRegistryRepo],
        }).compile();
        sut = module.get(SchulconnexPushRegistryRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await orm.close();
        await module.close();
    });

    beforeEach(async () => {
        await em.nativeDelete(SchulconnexPushRegistryEntity, {});
    });

    async function createAndPersistPushRegistry(
        oidcClientSecretRef: string = 'EXAMPLE_PROVIDER',
    ): Promise<SchulconnexPushRegistryEntity> {
        const serviceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
        const entity: SchulconnexPushRegistryEntity = em.create(SchulconnexPushRegistryEntity, {
            serviceProvider: em.getReference(ServiceProviderEntity, serviceProvider.id),
            baseUrl: faker.internet.url(),
            oidcTokenEndpoint: 'https://identity.example/token',
            oidcClientId: 'push-client',
            oidcClientSecretRef,
        });
        await em.persist(entity).flush();

        return entity;
    }

    describe('findById', () => {
        it('should return the registry if it exists', async () => {
            const entity: SchulconnexPushRegistryEntity = await createAndPersistPushRegistry();

            const result: Option<SchulconnexPushRegistry<true>> = await sut.findById(entity.id);

            expect(result).toEqual<SchulconnexPushRegistry<true>>({
                id: entity.id,
                createdAt: entity.createdAt,
                updatedAt: entity.updatedAt,
                serviceProviderId: entity.serviceProvider.id,
                baseUrl: entity.baseUrl,
                oidcTokenEndpoint: 'https://identity.example/token',
                oidcClientId: 'push-client',
                oidcClientSecretRef: 'EXAMPLE_PROVIDER',
            });
        });

        it('should return null if the registry does not exist', async () => {
            const result: Option<SchulconnexPushRegistry<true>> = await sut.findById(faker.string.uuid());

            expect(result).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return all registries', async () => {
            const entity1: SchulconnexPushRegistryEntity = await createAndPersistPushRegistry();
            const entity2: SchulconnexPushRegistryEntity = await createAndPersistPushRegistry('ANOTHER_PROVIDER');

            const result: SchulconnexPushRegistry<true>[] = await sut.findAll();

            expect(result).toHaveLength(2);
            expect(result).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: entity1.id, oidcClientSecretRef: 'EXAMPLE_PROVIDER' }),
                    expect.objectContaining({ id: entity2.id, oidcClientSecretRef: 'ANOTHER_PROVIDER' }),
                ]),
            );
        });

        it('should return an empty array if no registries exist', async () => {
            const result: SchulconnexPushRegistry<true>[] = await sut.findAll();

            expect(result).toEqual([]);
        });
    });
});
