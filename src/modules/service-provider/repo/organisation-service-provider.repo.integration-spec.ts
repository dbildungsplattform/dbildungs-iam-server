import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ServiceProviderModule } from '../service-provider.module.js';
import { OrganisationServiceProviderRepo } from './organisation-service-provider.repo.js';

describe('OrganisationServiceProviderRepo', () => {
    let module: TestingModule;
    let sut: OrganisationServiceProviderRepo;
    let organisationRepo: OrganisationRepository;

    let orm: MikroORM;
    let em: EntityManager;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                LoggingTestModule,
                ServiceProviderModule,
            ],
            providers: [
                OrganisationServiceProviderRepo,
                OrganisationRepository,
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
            ],
        }).compile();

        sut = module.get(OrganisationServiceProviderRepo);
        organisationRepo = module.get(OrganisationRepository);
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
        expect(organisationRepo).toBeDefined();
        expect(em).toBeDefined();
    });

    describe('save', () => {
        it('should save a new OrganisationServiceProvider mapping', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false);
            const persistedOrganisation: Organisation<true> = await organisationRepo.save(organisation);
            const persistedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);

            await expect(sut.save(persistedOrganisation, persistedServiceProvider)).resolves.not.toThrow();
        });
    });

    describe('deleteAll', () => {
        it('should delete all existing OrganisationServiceProvider mappings', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false);
            const persistedOrganisation: Organisation<true> = await organisationRepo.save(organisation);
            const organisation2: Organisation<false> = DoFactory.createOrganisation(false);
            const persistedOrganisation2: Organisation<true> = await organisationRepo.save(organisation2);
            const persistedServiceProvider: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const persistedServiceProvider2: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            const persistedServiceProvider3: ServiceProvider<true> = await createAndPersistServiceProvider(em);
            await sut.save(persistedOrganisation, persistedServiceProvider);
            await sut.save(persistedOrganisation, persistedServiceProvider2);
            await sut.save(persistedOrganisation2, persistedServiceProvider2);
            await sut.save(persistedOrganisation2, persistedServiceProvider3);

            const result: boolean = await sut.deleteAll();

            expect(result).toBeTruthy();
        });
    });
});
