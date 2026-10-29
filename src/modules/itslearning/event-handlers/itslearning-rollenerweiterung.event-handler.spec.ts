import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { KafkaRollenerweiterungCreatedEvent } from '../../../shared/events/kafka-rollenerweiterung-created.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { RollenerweiterungCreatedEvent } from '../../../shared/events/rollenerweiterung-created.event.js';
import { RollenerweiterungDeletedEvent } from '../../../shared/events/rollenerweiterung-deleted.event.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { ItsLearningRollenerweiterungEventHandler } from './itslearning-rollenerweiterung.event-handler.js';
import { ItsLearningSyncEventHandler } from './itslearning-sync.event-handler.js';

describe('ItsLearningRollenerweiterungEventHandler', () => {
    let module: TestingModule;
    let sut: ItsLearningRollenerweiterungEventHandler;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let serviceProviderRepoMock: DeepMocked<ServiceProviderRepo>;
    let syncEventHandlerMock: DeepMocked<ItsLearningSyncEventHandler>;
    let loggerMock: DeepMocked<ClassLogger>;

    const keepAlive: () => void = vi.fn();

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot(), LoggingTestModule],
            providers: [
                ItsLearningRollenerweiterungEventHandler,
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: ItsLearningSyncEventHandler,
                    useValue: createMock(ItsLearningSyncEventHandler),
                },
            ],
        }).compile();

        sut = module.get(ItsLearningRollenerweiterungEventHandler);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        serviceProviderRepoMock = module.get(ServiceProviderRepo);
        syncEventHandlerMock = module.get(ItsLearningSyncEventHandler);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        sut.ENABLED = true;
        personenkontextRepoMock.findPersonIdsWithRolleInOrganisationSubtree.mockResolvedValue([]);
    });

    const itslearningProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
        externalSystem: ServiceProviderSystem.ITSLEARNING,
    });

    describe('when a Rollenerweiterung for itslearning is created', () => {
        it('should sync every person holding the rolle in the organisation subtree', async () => {
            const event: RollenerweiterungCreatedEvent = new KafkaRollenerweiterungCreatedEvent(
                'orga-id',
                'rolle-id',
                itslearningProvider.id,
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(itslearningProvider);
            personenkontextRepoMock.findPersonIdsWithRolleInOrganisationSubtree.mockResolvedValueOnce(['p1', 'p2']);

            await sut.rollenerweiterungCreatedEventHandler(event, keepAlive);

            expect(personenkontextRepoMock.findPersonIdsWithRolleInOrganisationSubtree).toHaveBeenCalledWith(
                'orga-id',
                'rolle-id',
                expect.any(Number),
                undefined,
            );
            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).toHaveBeenCalledTimes(2);
            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).toHaveBeenCalledWith(
                expect.any(PersonExternalSystemsSyncEvent),
            );
        });

        it('should ignore the event if the service provider is not itslearning', async () => {
            const event: RollenerweiterungCreatedEvent = new RollenerweiterungCreatedEvent(
                'orga-id',
                'rolle-id',
                'other-sp-id',
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createServiceProvider(true, { externalSystem: ServiceProviderSystem.NONE }),
            );

            await sut.rollenerweiterungCreatedEventHandler(event, keepAlive);

            expect(personenkontextRepoMock.findPersonIdsWithRolleInOrganisationSubtree).not.toHaveBeenCalled();
            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).not.toHaveBeenCalled();
        });

        it('should ignore the event if the service provider does not exist', async () => {
            const event: RollenerweiterungCreatedEvent = new RollenerweiterungCreatedEvent(
                'orga-id',
                'rolle-id',
                'missing-sp-id',
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(null);

            await sut.rollenerweiterungCreatedEventHandler(event, keepAlive);

            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).not.toHaveBeenCalled();
        });

        it('should do nothing if the handler is not enabled', async () => {
            sut.ENABLED = false;
            const event: RollenerweiterungCreatedEvent = new RollenerweiterungCreatedEvent(
                'orga-id',
                'rolle-id',
                itslearningProvider.id,
            );

            await sut.rollenerweiterungCreatedEventHandler(event, keepAlive);

            expect(serviceProviderRepoMock.findById).not.toHaveBeenCalled();
            expect(personenkontextRepoMock.findPersonIdsWithRolleInOrganisationSubtree).not.toHaveBeenCalled();
        });

        it('should continue with the remaining persons if one sync fails', async () => {
            const event: RollenerweiterungCreatedEvent = new RollenerweiterungCreatedEvent(
                'orga-id',
                'rolle-id',
                itslearningProvider.id,
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(itslearningProvider);
            personenkontextRepoMock.findPersonIdsWithRolleInOrganisationSubtree.mockResolvedValueOnce(['p1', 'p2']);
            syncEventHandlerMock.personExternalSystemSyncEventHandler
                .mockRejectedValueOnce(new Error('boom'))
                .mockResolvedValueOnce(undefined);

            await sut.rollenerweiterungCreatedEventHandler(event, keepAlive);

            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).toHaveBeenCalledTimes(2);
            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Sync of person p1 failed'));
        });
    });

    describe('when a Rollenerweiterung for itslearning is deleted', () => {
        it('should re-sync the persons so the sync handler can decide about removing access', async () => {
            const event: RollenerweiterungDeletedEvent = new RollenerweiterungDeletedEvent(
                'orga-id',
                'rolle-id',
                itslearningProvider.id,
            );
            serviceProviderRepoMock.findById.mockResolvedValueOnce(itslearningProvider);
            personenkontextRepoMock.findPersonIdsWithRolleInOrganisationSubtree.mockResolvedValueOnce(['p1']);

            await sut.rollenerweiterungDeletedEventHandler(event, keepAlive);

            expect(syncEventHandlerMock.personExternalSystemSyncEventHandler).toHaveBeenCalledTimes(1);
        });
    });
});
