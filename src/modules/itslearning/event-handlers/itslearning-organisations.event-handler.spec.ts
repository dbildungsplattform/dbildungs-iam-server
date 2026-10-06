import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';

import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { KlasseCreatedEvent } from '../../../shared/events/klasse-created.event.js';
import { KlasseUpdatedEvent } from '../../../shared/events/klasse-updated.event.js';
import { SchuleItslearningEnabledEvent } from '../../../shared/events/schule-itslearning-enabled.event.js';
import { SchuleUpdatedEvent } from '../../../shared/events/schule-updated.event.js';
import { OrganisationsTyp, RootDirectChildrenType } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { CreateGroupParams } from '../adapter/technical/actions/create-group.params.js';
import { ItslearningGroupAdapter } from '../adapter/domain/itslearning-group.adapter.js';
import { ItsLearningOrganisationsEventHandler } from './itslearning-organisations.event-handler.js';
import { OrganisationDeletedEvent } from '../../../shared/events/organisation-deleted.event.js';
import { DomainErrorMock } from '../../../../test/utils/error.mock.js';

describe('ItsLearning Organisations Event Handler', () => {
    let module: TestingModule;

    let sut: ItsLearningOrganisationsEventHandler;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;
    let itslearningGroupRepoAdapter: DeepMocked<ItslearningGroupAdapter>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                ItsLearningOrganisationsEventHandler,
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: ItslearningGroupAdapter,
                    useValue: createMock(ItslearningGroupAdapter),
                },
            ],
        }).compile();

        sut = module.get(ItsLearningOrganisationsEventHandler);
        itslearningGroupRepoAdapter = module.get(ItslearningGroupAdapter);
        orgaRepoMock = module.get(OrganisationRepository);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        sut.ENABLED = true;
        vi.resetAllMocks();
    });

    describe('createKlasseEventHandler', () => {
        it('should log on success', async () => {
            const event: KlasseCreatedEvent = new KlasseCreatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );
            itslearningGroupRepoAdapter.readGroup.mockResolvedValueOnce({
                name: faker.string.alphanumeric(),
                parentId: faker.string.uuid(),
                type: 'Unspecified',
            }); // ReadGroupAction
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { itslearningEnabled: true }),
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(undefined); // CreateGroupAction

            await sut.createKlasseEventHandler(event);

            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).toHaveBeenLastCalledWith<
                [CreateGroupParams, string]
            >(
                {
                    id: event.id,
                    name: event.name!,
                    parentId: event.administriertVon!,
                    type: 'Unspecified',
                },
                `${event.eventID}-KLASSE-CREATED`,
            );
            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Klasse with ID ${event.id} created.`,
            );
        });

        it('should truncate name if it is too long', async () => {
            const event: KlasseCreatedEvent = new KlasseCreatedEvent(
                faker.string.uuid(),
                'Klasse with a name that is way too long should be truncated',
                faker.string.uuid(),
            );
            itslearningGroupRepoAdapter.readGroup.mockResolvedValueOnce({
                name: faker.string.alphanumeric(),
                parentId: faker.string.uuid(),
                type: 'Unspecified',
            }); // ReadGroupAction
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { itslearningEnabled: true }),
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(undefined); // CreateGroupAction

            await sut.createKlasseEventHandler(event);

            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).toHaveBeenLastCalledWith<
                [CreateGroupParams, string]
            >(
                {
                    id: event.id,
                    name: 'Klasse with a name that is way too long shoul...',
                    parentId: event.administriertVon!,
                    type: 'Unspecified',
                },
                `${event.eventID}-KLASSE-CREATED`,
            );
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            const event: KlasseCreatedEvent = new KlasseCreatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );

            await sut.createKlasseEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).not.toHaveBeenCalled();
        });

        it('should log error, if administriertVon is undefined', async () => {
            const event: KlasseCreatedEvent = new KlasseCreatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                undefined,
            );

            await sut.createKlasseEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Klasse has no parent organisation. Aborting.`,
            );
        });

        it('should log error, if the klasse has no name', async () => {
            const event: KlasseCreatedEvent = new KlasseCreatedEvent(
                faker.string.uuid(),
                undefined,
                faker.string.uuid(),
            );

            await sut.createKlasseEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Klasse has no name. Aborting.`);
        });

        it('should log info, if the parent school is not itslearning enabled', async () => {
            const event: KlasseCreatedEvent = new KlasseCreatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { itslearningEnabled: false }),
            );

            await sut.createKlasseEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Parent Organisation (${event.administriertVon}) is not an itslearning schule.`,
            );
        });

        it('should log error on failed creation', async () => {
            const event: KlasseCreatedEvent = new KlasseCreatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { itslearningEnabled: true }),
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(new DomainErrorMock('Error')); // CreateGroupAction

            await sut.createKlasseEventHandler(event);
            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Could not create Klasse in itsLearning: Error`,
            );
        });
    });

    describe('updatedKlasseEventHandler', () => {
        it('should log on success', async () => {
            const event: KlasseUpdatedEvent = new KlasseUpdatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { itslearningEnabled: true }),
            );

            await sut.updatedKlasseEventHandler(event);

            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).toHaveBeenLastCalledWith<
                [CreateGroupParams, string]
            >(
                {
                    id: event.organisationId,
                    name: event.name,
                    parentId: event.administriertVon!,
                    type: 'Unspecified',
                },
                `${event.eventID}-KLASSE-UPDATED`,
            );
            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Klasse with ID ${event.organisationId} was updated.`,
            );
        });

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            const event: KlasseUpdatedEvent = new KlasseUpdatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );

            await sut.updatedKlasseEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).not.toHaveBeenCalled();
        });

        it('should log error, if administriertVon is undefined', async () => {
            const event: KlasseUpdatedEvent = new KlasseUpdatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                undefined,
            );

            await sut.updatedKlasseEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Klasse has no parent organisation. Aborting.`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).not.toHaveBeenCalled();
        });

        it('should log error, if the klasse has no name', async () => {
            const event: KlasseUpdatedEvent = new KlasseUpdatedEvent(faker.string.uuid(), '', faker.string.uuid());

            await sut.updatedKlasseEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Klasse has no name. Aborting.`);
            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).not.toHaveBeenCalled();
        });

        it('should log info, if the parent school is not itslearning enabled', async () => {
            const event: KlasseUpdatedEvent = new KlasseUpdatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { itslearningEnabled: false }),
            );

            await sut.updatedKlasseEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Parent Organisation (${event.administriertVon}) is not an itslearning schule.`,
            );
        });

        it('should log error on failed update', async () => {
            const event: KlasseUpdatedEvent = new KlasseUpdatedEvent(
                faker.string.uuid(),
                faker.string.alphanumeric(),
                faker.string.uuid(),
            );
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { itslearningEnabled: true }),
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(new DomainErrorMock('Error')); // UpdateGroupAction

            await sut.updatedKlasseEventHandler(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Could not update Klasse in itsLearning: Error`,
            );
        });
    });

    describe('schuleItslearningEnabledEventHandler', () => {
        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.SCHULE,
                faker.string.numeric(7),
                faker.word.noun(),
            );

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).not.toHaveBeenCalled();
        });

        it('should log error, if organisation is not a schule', async () => {
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.UNBEST,
                faker.string.numeric(7),
                faker.word.noun(),
            );

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] The organisation with ID ${event.organisationId} is not of type "SCHULE"!`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).not.toHaveBeenCalled();
        });

        it('should skip event, when schule is ersatzschule', async () => {
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.SCHULE,
                faker.string.numeric(7),
                faker.word.noun(),
            );
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.ERSATZ,
            );

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Ersatzschule, ignoring.`);
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).not.toHaveBeenCalled();
        });

        it('should log error, if creation failed', async () => {
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.SCHULE,
                faker.string.numeric(7),
                faker.word.noun(),
            );
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            orgaRepoMock.findChildOrgasForIds.mockResolvedValueOnce([]);
            itslearningGroupRepoAdapter.createOrUpdateGroups.mockResolvedValueOnce(new DomainErrorMock('Error'));

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Could not create Schule (ID ${event.organisationId}) and its Klassen in itsLearning: Error`,
            );
        });

        it('should call createOrUpdateGroups with correct params', async () => {
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.SCHULE,
                faker.string.numeric(7),
                faker.word.noun(),
            );
            const klasse1: Organisation<true> = DoFactory.createOrganisation(true, {
                name: faker.word.noun(),
                typ: OrganisationsTyp.KLASSE,
            });
            const klasse2: Organisation<true> = DoFactory.createOrganisation(true, {
                name: '',
                typ: OrganisationsTyp.KLASSE,
            });
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            orgaRepoMock.findChildOrgasForIds.mockResolvedValueOnce([klasse1, klasse2]);
            itslearningGroupRepoAdapter.createOrUpdateGroups.mockResolvedValueOnce(undefined);

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} and its 2 Klassen were created.`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).toHaveBeenCalledWith<
                [CreateGroupParams[], string]
            >(
                [
                    {
                        id: event.organisationId,
                        name: `${event.kennung} (${event.name})`,
                        type: 'School',
                        parentId: sut.ROOT_OEFFENTLICH,
                    },
                    {
                        id: klasse1.id,
                        name: `${klasse1.name}`,
                        type: 'Unspecified',
                        parentId: event.organisationId,
                    },
                    {
                        id: klasse2.id,
                        name: `Unbenannte Klasse`,
                        type: 'Unspecified',
                        parentId: event.organisationId,
                    },
                ],
                `${event.eventID}-SCHULE-SYNC`,
            );
        });

        it('should set default dienststellennummer for schule', async () => {
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.SCHULE,
                undefined,
                faker.string.alphanumeric(10),
            );
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            orgaRepoMock.findChildOrgasForIds.mockResolvedValueOnce([]);
            itslearningGroupRepoAdapter.createOrUpdateGroups.mockResolvedValueOnce(undefined);

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} and its 0 Klassen were created.`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).toHaveBeenCalledWith<
                [CreateGroupParams[], string]
            >(
                [
                    {
                        id: event.organisationId,
                        name: `Unbekannte Dienststellennummer (${event.name})`,
                        type: 'School',
                        parentId: sut.ROOT_OEFFENTLICH,
                    },
                ],
                `${event.eventID}-SCHULE-SYNC`,
            );
        });

        it('should set default name for schule', async () => {
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.SCHULE,
                faker.string.numeric(7),
                undefined,
            );
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            orgaRepoMock.findChildOrgasForIds.mockResolvedValueOnce([]);
            itslearningGroupRepoAdapter.createOrUpdateGroups.mockResolvedValueOnce(undefined);

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} and its 0 Klassen were created.`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).toHaveBeenCalledWith<
                [CreateGroupParams[], string]
            >(
                [
                    {
                        id: event.organisationId,
                        name: `${event.kennung} (Unbenannte Schule)`,
                        type: 'School',
                        parentId: sut.ROOT_OEFFENTLICH,
                    },
                ],
                `${event.eventID}-SCHULE-SYNC`,
            );
        });

        it('should truncate name if too long', async () => {
            const event: SchuleItslearningEnabledEvent = new SchuleItslearningEnabledEvent(
                faker.string.uuid(),
                OrganisationsTyp.SCHULE,
                faker.string.numeric(7),
                'Schule with a name that is way too long should be truncated',
            );
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            orgaRepoMock.findChildOrgasForIds.mockResolvedValueOnce([]);
            itslearningGroupRepoAdapter.createOrUpdateGroups.mockResolvedValueOnce(undefined);

            await sut.schuleItslearningEnabledEventHandler(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} and its 0 Klassen were created.`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).toHaveBeenCalledWith<
                [CreateGroupParams[], string]
            >(
                [
                    {
                        id: event.organisationId,
                        name: `${event.kennung} (Schule with a name that is way too ...)`,
                        type: 'School',
                        parentId: sut.ROOT_OEFFENTLICH,
                    },
                ],
                `${event.eventID}-SCHULE-SYNC`,
            );
        });
    });

    describe('schuleUpdatedEventHandler', () => {
        function createEvent(overrides: Partial<SchuleUpdatedEvent> = {}): SchuleUpdatedEvent {
            return Object.assign(
                new SchuleUpdatedEvent(
                    faker.string.uuid(),
                    faker.string.numeric(7),
                    faker.word.noun(),
                    true,
                    faker.string.uuid(),
                    faker.string.uuid(),
                    faker.string.numeric(7),
                    faker.word.noun(),
                    faker.string.uuid(),
                    faker.string.uuid(),
                ),
                overrides,
            );
        }

        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            const event: SchuleUpdatedEvent = createEvent();

            await sut.schuleUpdatedEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).not.toHaveBeenCalled();
        });

        it('should skip event, if schule is not itslearning enabled', async () => {
            const event: SchuleUpdatedEvent = createEvent({ itslearningEnabled: false });

            await sut.schuleUpdatedEventHandler(event);

            expect(loggerMock.info).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} is not itslearning enabled. Ignoring event.`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).not.toHaveBeenCalled();
        });

        it('should skip event, when schule is ersatzschule', async () => {
            const event: SchuleUpdatedEvent = createEvent();
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.ERSATZ,
            );

            await sut.schuleUpdatedEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Ersatzschule, ignoring.`);
            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).not.toHaveBeenCalled();
        });

        it('should log error, if update failed', async () => {
            const event: SchuleUpdatedEvent = createEvent();
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(new DomainErrorMock('Error'));

            await sut.schuleUpdatedEventHandler(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Could not update Schule (ID ${event.organisationId}) in itsLearning: Error`,
            );
        });

        it('should call createOrUpdateGroup with correct params', async () => {
            const event: SchuleUpdatedEvent = createEvent();
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(undefined);

            await sut.schuleUpdatedEventHandler(event);

            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).toHaveBeenCalledWith<[CreateGroupParams, string]>(
                {
                    id: event.organisationId,
                    name: `${event.kennung} (${event.name})`,
                    type: 'School',
                    parentId: sut.ROOT_OEFFENTLICH,
                },
                `${event.eventID}-SCHULE-UPDATED`,
            );
            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} was updated.`,
            );
        });

        it('should set default dienststellennummer for schule', async () => {
            const event: SchuleUpdatedEvent = createEvent({ kennung: undefined, name: faker.string.alphanumeric(10) });
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(undefined);

            await sut.schuleUpdatedEventHandler(event);

            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).toHaveBeenCalledWith<[CreateGroupParams, string]>(
                {
                    id: event.organisationId,
                    name: `Unbekannte Dienststellennummer (${event.name})`,
                    type: 'School',
                    parentId: sut.ROOT_OEFFENTLICH,
                },
                `${event.eventID}-SCHULE-UPDATED`,
            );
        });

        it('should set default name for schule', async () => {
            const event: SchuleUpdatedEvent = createEvent({ name: undefined });
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(undefined);

            await sut.schuleUpdatedEventHandler(event);

            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).toHaveBeenCalledWith<[CreateGroupParams, string]>(
                {
                    id: event.organisationId,
                    name: `${event.kennung} (Unbenannte Schule)`,
                    type: 'School',
                    parentId: sut.ROOT_OEFFENTLICH,
                },
                `${event.eventID}-SCHULE-UPDATED`,
            );
        });

        it('should truncate name if too long', async () => {
            const event: SchuleUpdatedEvent = createEvent({
                name: 'Schule with a name that is way too long should be truncated',
            });
            orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            );
            itslearningGroupRepoAdapter.createOrUpdateGroup.mockResolvedValueOnce(undefined);

            await sut.schuleUpdatedEventHandler(event);

            expect(itslearningGroupRepoAdapter.createOrUpdateGroup).toHaveBeenCalledWith<[CreateGroupParams, string]>(
                {
                    id: event.organisationId,
                    name: `${event.kennung} (Schule with a name that is way too ...)`,
                    type: 'School',
                    parentId: sut.ROOT_OEFFENTLICH,
                },
                `${event.eventID}-SCHULE-UPDATED`,
            );
        });
    });

    describe('organisationDeletedEventHandler', () => {
        it('should skip event, if not enabled', async () => {
            sut.ENABLED = false;
            const event: OrganisationDeletedEvent = new OrganisationDeletedEvent(
                faker.string.uuid(),
                faker.word.noun(),
                faker.string.numeric(7),
                OrganisationsTyp.SCHULE,
            );

            await sut.organisationDeletedEventHandler(event);
            expect(loggerMock.info).toHaveBeenCalledWith(`[EventID: ${event.eventID}] Not enabled, ignoring event.`);
            expect(itslearningGroupRepoAdapter.deleteGroup).not.toHaveBeenCalled();
        });

        it('should log error, if organisation is not a schule or klasse', async () => {
            const event: OrganisationDeletedEvent = new OrganisationDeletedEvent(
                faker.string.uuid(),
                faker.word.noun(),
                faker.string.numeric(7),
                OrganisationsTyp.UNBEST,
            );

            await sut.organisationDeletedEventHandler(event);

            expect(loggerMock.error).toHaveBeenCalledWith(
                `[EventID: ${event.eventID}] The organisation with ID ${event.organisationId} is not of type "SCHULE" or "KLASSE"!`,
            );
            expect(itslearningGroupRepoAdapter.createOrUpdateGroups).not.toHaveBeenCalled();
        });

        it('should log error, if deletion failed', async () => {
            const event: OrganisationDeletedEvent = new OrganisationDeletedEvent(
                faker.string.uuid(),
                faker.word.noun(),
                faker.string.numeric(7),
                OrganisationsTyp.SCHULE,
            );
            orgaRepoMock.findChildOrgasForIds.mockResolvedValueOnce([]);
            itslearningGroupRepoAdapter.deleteGroup.mockResolvedValueOnce(new DomainErrorMock('Error'));

            await sut.organisationDeletedEventHandler(event);

            expect(loggerMock.error).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Could not delete Schule (ID ${event.organisationId}) in itsLearning: Error`,
            );
        });

        it('should call deleteGroup with correct params', async () => {
            const event: OrganisationDeletedEvent = new OrganisationDeletedEvent(
                faker.string.uuid(),
                faker.word.noun(),
                faker.string.numeric(7),
                OrganisationsTyp.SCHULE,
            );
            itslearningGroupRepoAdapter.deleteGroup.mockResolvedValueOnce(undefined);

            await sut.organisationDeletedEventHandler(event);

            expect(loggerMock.info).toHaveBeenLastCalledWith(
                `[EventID: ${event.eventID}] Schule with ID ${event.organisationId} was deleted.`,
            );
            expect(itslearningGroupRepoAdapter.deleteGroup).toHaveBeenCalledWith(
                event.organisationId,
                `${event.eventID}-ORGANISATION-DELETED`,
            );
        });
    });
});
