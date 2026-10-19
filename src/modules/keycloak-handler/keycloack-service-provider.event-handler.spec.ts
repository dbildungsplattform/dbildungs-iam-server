import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { KeycloackServiceProviderHandler } from './keycloack-service-provider.event-handler.js';
import { KeycloakUserService } from '../keycloak-administration/index.js';
import {
    type PersonenkontextUpdatedData,
    PersonenkontextUpdatedEvent,
    type PersonenkontextUpdatedPersonData,
} from '../../shared/events/personenkontext-updated.event.js';
import { type RolleID } from '../../shared/types/aggregate-ids.types.js';
import { faker } from '@faker-js/faker';
import { RolleRepo } from '../rolle/repo/rolle.repo.js';
import { type Rolle } from '../rolle/domain/rolle.js';
import { DoFactory } from '../../../test/utils/do-factory.js';
import { ConfigTestModule, DatabaseTestModule, LoggingTestModule } from '../../../test/utils/index.js';

describe('KeycloackServiceProviderHandler', () => {
    let module: TestingModule;
    let sut: KeycloackServiceProviderHandler;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let keycloakUserServiceMock: DeepMocked<KeycloakUserService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                KeycloackServiceProviderHandler,
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
            ],
        }).compile();

        sut = module.get(KeycloackServiceProviderHandler);
        rolleRepoMock = module.get(RolleRepo);
        keycloakUserServiceMock = module.get(KeycloakUserService);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should update user roles when new roles are added', async () => {
        // Arrange
        const keycloakUserId: string = faker.string.uuid();
        const newRolleId: string = faker.string.uuid();
        const currentRolleId: string = faker.string.uuid();
        const newKeycloakRole: string = faker.string.uuid();
        const currentKeycloakRole: string = faker.string.uuid();

        const personenkontextUpdatedEventMock: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
            {
                keycloakUserId,
            } as PersonenkontextUpdatedPersonData,
            [{ rolleId: newRolleId } as PersonenkontextUpdatedData],
            [],
            [{ rolleId: currentRolleId } as PersonenkontextUpdatedData],
        );

        rolleRepoMock.findByIds.mockResolvedValueOnce(
            new Map([[newRolleId, { serviceProviderData: [{ keycloakGroup: newKeycloakRole }] } as Rolle<true>]]),
        );
        rolleRepoMock.findByIds.mockResolvedValueOnce(
            new Map([
                [currentRolleId, { serviceProviderData: [{ keycloakGroup: currentKeycloakRole }] } as Rolle<true>],
            ]),
        );

        // Act
        await sut.handlePersonenkontextUpdatedEvent(personenkontextUpdatedEventMock);

        // Assert
        expect(keycloakUserServiceMock.assignRealmGroupsToUser).toHaveBeenCalledWith(keycloakUserId, [newKeycloakRole]);
        expect(keycloakUserServiceMock.removeRealmGroupsFromUser).not.toHaveBeenCalled();

        const allServiceProvidersNames: Set<string | undefined> = new Set([newKeycloakRole]);
        const specificServiceProvidersNames: Set<string | undefined> = new Set([currentKeycloakRole]);

        expect(Array.from(allServiceProvidersNames)).toEqual([newKeycloakRole]);
        expect(Array.from(specificServiceProvidersNames)).toEqual([currentKeycloakRole]);
    });

    it('should handle undefined serviceProviderData and keycloakGroup correctly', async () => {
        // Arrange

        const newRolleId: string = faker.string.uuid();
        const currentRolleId: string = faker.string.uuid();
        const rolleWithoutServiceProvider: Rolle<true> = DoFactory.createRolle(true, {
            serviceProviderData: undefined,
        });
        const rolleWithoutServiceProvider2: Rolle<true> = DoFactory.createRolle(true, {
            serviceProviderData: undefined,
        });

        rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[newRolleId, rolleWithoutServiceProvider]]));
        rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[currentRolleId, rolleWithoutServiceProvider2]]));

        const personenkontextUpdatedEventMock: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
            {
                keycloakUserId: faker.string.uuid(),
            } as PersonenkontextUpdatedPersonData,
            [{ rolleId: newRolleId } as PersonenkontextUpdatedData],
            [],
            [{ rolleId: currentRolleId } as PersonenkontextUpdatedData],
        );

        await sut.handlePersonenkontextUpdatedEvent(personenkontextUpdatedEventMock);

        // Assert
        expect(keycloakUserServiceMock.assignRealmGroupsToUser).not.toHaveBeenCalled();
        expect(keycloakUserServiceMock.removeRealmGroupsFromUser).not.toHaveBeenCalled();
    });

    it('should remove user roles when roles are removed', async () => {
        // Arrange
        const keycloakUserId: string = faker.string.uuid();
        const deleteRolleId: string = faker.string.uuid();
        const currentRolleId: string = faker.string.uuid();
        const deleteKeycloakRole: string = faker.string.uuid();
        const currentKeycloakRole: string = faker.string.uuid();

        const personenkontextUpdatedEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
            {
                keycloakUserId,
            } as PersonenkontextUpdatedPersonData,
            [],
            [{ rolleId: deleteRolleId } as PersonenkontextUpdatedData],
            [{ rolleId: currentRolleId } as PersonenkontextUpdatedData],
        );

        rolleRepoMock.findByIds.mockResolvedValueOnce(
            new Map([[deleteRolleId, { serviceProviderData: [{ keycloakGroup: deleteKeycloakRole }] } as Rolle<true>]]),
        );
        rolleRepoMock.findByIds.mockResolvedValueOnce(
            new Map([
                [currentRolleId, { serviceProviderData: [{ keycloakGroup: currentKeycloakRole }] } as Rolle<true>],
            ]),
        );

        // Act
        await sut.handlePersonenkontextUpdatedEvent(personenkontextUpdatedEvent);

        // Assert
        expect(keycloakUserServiceMock.removeRealmGroupsFromUser).toHaveBeenCalledWith(keycloakUserId, [
            deleteKeycloakRole,
        ]);
        expect(keycloakUserServiceMock.assignRealmGroupsToUser).not.toHaveBeenCalled();

        const specificServiceProvidersNames: Set<string | undefined> = new Set([currentKeycloakRole]);

        expect(Array.from(specificServiceProvidersNames)).toEqual([currentKeycloakRole]);
    });

    it('should not update roles if no Keycloak user ID is present', async () => {
        // Arrange
        const personenkontextUpdatedEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
            {
                keycloakUserId: undefined,
            } as PersonenkontextUpdatedPersonData,
            [{ rolleId: faker.string.uuid() } as PersonenkontextUpdatedData],
            [],
            [{ rolleId: faker.string.uuid() } as PersonenkontextUpdatedData],
        );

        // Act
        await sut.handlePersonenkontextUpdatedEvent(personenkontextUpdatedEvent);

        // Assert
        expect(rolleRepoMock.findByIds).not.toHaveBeenCalled();
        expect(keycloakUserServiceMock.assignRealmGroupsToUser).not.toHaveBeenCalled();
        expect(keycloakUserServiceMock.removeRealmGroupsFromUser).not.toHaveBeenCalled();
    });

    it('should return the correct currentRolleIDs', async () => {
        // Arrange
        const rolleID: string = faker.string.uuid();
        const rollID2: string = faker.string.uuid();
        const keycloakUserId: string = faker.string.uuid();
        const personenkontextUpdatedEvent: PersonenkontextUpdatedEvent = new PersonenkontextUpdatedEvent(
            {
                keycloakUserId: keycloakUserId,
            } as PersonenkontextUpdatedPersonData,
            [{ rolleId: rolleID } as PersonenkontextUpdatedData],
            [],
            [{ rolleId: rolleID }, { rolleId: rollID2 }] as PersonenkontextUpdatedData[],
        );

        rolleRepoMock.findByIds.mockResolvedValueOnce(
            new Map([
                [faker.string.uuid(), { serviceProviderData: [{ keycloakRole: keycloakUserId }] } as Rolle<true>],
            ]),
        );
        rolleRepoMock.findByIds.mockResolvedValueOnce(
            new Map([[faker.string.uuid(), { serviceProviderData: [{ keycloakRole: 'delete' }] } as Rolle<true>]]),
        );

        const newRolle: RolleID | undefined = personenkontextUpdatedEvent.newKontexte?.[0]?.rolleId;
        const currentRolleIDs: RolleID[] =
            personenkontextUpdatedEvent.currentKontexte
                ?.map((kontext: PersonenkontextUpdatedData) => kontext.rolleId)
                .filter((id: RolleID) => id && id !== newRolle) || [];

        // Act
        await sut.handlePersonenkontextUpdatedEvent(personenkontextUpdatedEvent);

        // Assert
        expect(currentRolleIDs).toEqual([rollID2]);
    });
});
