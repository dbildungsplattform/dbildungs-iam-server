import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';

import {
    ConfigTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderMerkmal } from '../domain/service-provider.enum.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { mapEntityToAggregate } from './service-provider-entity-mapper.js';
import { ServiceProviderEntity } from './service-provider.entity.js';
import { ServiceProviderInternalRepo } from './service-provider.internal.repo.js';

describe('ServiceProviderInternalRepo', () => {
    let module: TestingModule;
    let sut: ServiceProviderInternalRepo;

    let orm: MikroORM;
    let em: EntityManager;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LoggingTestModule],
            providers: [ServiceProviderInternalRepo],
        }).compile();

        sut = module.get(ServiceProviderInternalRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
        expect(em).toBeDefined();
    });

    describe('existsDuplicateNameForOrganisation', () => {
        it('should return true, if a serviceprovider with the same name at the same orga already exists', async () => {
            const name: string = faker.string.alphanumeric();
            const providedOnSchulstrukturknoten: string = faker.string.uuid();

            await createAndPersistServiceProvider(em, { name, providedOnSchulstrukturknoten });

            const promise: Promise<boolean> = sut.existsDuplicateNameForOrganisation(
                name,
                providedOnSchulstrukturknoten,
                undefined,
            );

            await expect(promise).resolves.toBe(true);
        });

        it('should return false, if no serviceprovider with the same name at the same orga already exists', async () => {
            const name: string = faker.string.alphanumeric();
            const orgaA: string = faker.string.uuid();
            const orgaB: string = faker.string.uuid();

            await createAndPersistServiceProvider(em, { name, providedOnSchulstrukturknoten: orgaA });

            const promise: Promise<boolean> = sut.existsDuplicateNameForOrganisation(name, orgaB, undefined);

            await expect(promise).resolves.toBe(false);
        });

        it('should ignore the serviceprovider with the given id', async () => {
            const sp: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            const promise: Promise<boolean> = sut.existsDuplicateNameForOrganisation(
                sp.name,
                sp.providedOnSchulstrukturknoten,
                sp.id,
            );

            await expect(promise).resolves.toBe(false);
        });

        it('should be case insensitive', async () => {
            const nameA: string = 'Example-Name';
            const nameB: string = 'eXAMPLE-nAME';
            const providedOnSchulstrukturknoten: string = faker.string.uuid();

            await createAndPersistServiceProvider(em, { name: nameA, providedOnSchulstrukturknoten });

            const promise: Promise<boolean> = sut.existsDuplicateNameForOrganisation(
                nameB,
                providedOnSchulstrukturknoten,
                undefined,
            );

            await expect(promise).resolves.toBe(true);
        });
    });

    describe('persistAndFlush', () => {
        it('should create serviceProvider', async () => {
            const sp: ServiceProvider<false> = DoFactory.createServiceProvider(false);
            const persistedSP: ServiceProvider<true> = await sut.persistAndFlush(sp);

            const entity: ServiceProviderEntity = await em.findOneOrFail(ServiceProviderEntity, {
                id: persistedSP.id,
            });
            expect(mapEntityToAggregate(entity)).toEqual(persistedSP);
        });

        it('should update serviceProvider', async () => {
            const updateddSP: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            updateddSP.update({
                name: 'test',
                merkmale: [ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG],
                rollenartenWhitelist: [RollenArt.LERN],
            });

            const persistedSP: ServiceProvider<true> = await sut.persistAndFlush(updateddSP);

            const entity: ServiceProviderEntity = await em.findOneOrFail(ServiceProviderEntity, {
                id: persistedSP.id,
            });
            expect(mapEntityToAggregate(entity)).toEqual(persistedSP);
        });
    });
});
