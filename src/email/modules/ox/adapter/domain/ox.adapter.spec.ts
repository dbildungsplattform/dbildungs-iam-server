import { createMock, type DeepMocked } from '../../../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { OxAdapter } from './ox.adapter.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { DatabaseTestModule, EmailConfigTestModule, LoggingTestModule } from '../../../../../../test/utils/index.js';
import { OxSendService } from '../technical/ox-send.service.js';
import { OxGroupNotFoundError } from './error/ox-group-not-found.error.js';
import { OxGroupNameAmbiguousError } from './error/ox-group-name-ambiguous.error.js';
import { type OXGroupID } from '../../../../../shared/types/ox-ids.types.js';
import { OxMemberAlreadyInGroupError } from './error/ox-member-already-in-group.error.js';
import { AddMemberToGroupAction } from '../technical/actions/group/add-member-to-group.action.js';
import { faker } from '@faker-js/faker';
import { ChangeUserAction } from '../technical/actions/user/change-user.action.js';
import { GetDataForUserAction } from '../technical/actions/user/get-data-user.action.js';
import { DeleteUserAction } from '../technical/actions/user/delete-user.action.js';
import { ExistsUserAction } from '../technical/actions/user/exists-user.action.js';
import { ChangeByModuleAccessAction } from '../technical/actions/user/change-by-module-access.action.js';
import { CreateUserAction } from '../technical/actions/user/create-user.action.js';
import { Err, Ok } from '../../../../../shared/util/result.js';
import { type OXGroup } from '../technical/actions/group/ox-group.types.js';
import { OxError } from '../../../../../shared/error/ox.error.js';
import { type ListGroupsForUserResponse } from '../technical/actions/group/list-groups-for-user.action.js';
import { type Mock } from 'vitest';
import { EmailAppConfig } from '../../../../../shared/config/email-app.config.js';

describe('OxAdapter', () => {
    let module: TestingModule;

    let sut: OxAdapter;
    let loggerMock: DeepMocked<ClassLogger>;
    let oxSendService: DeepMocked<OxSendService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, EmailConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                OxAdapter,
                {
                    provide: OxSendService,
                    useValue: createMock(OxSendService),
                },
            ],
        }).compile();

        sut = module.get(OxAdapter);
        oxSendService = module.get(OxSendService);
        loggerMock = module.get(ClassLogger);
        vi.useFakeTimers();
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        vi.restoreAllMocks();
    });

    describe('createOxGroup', () => {
        const oxGroupName: string = faker.string.alphanumeric({ length: 6 });
        const displayName: string = faker.string.alphanumeric({ length: 6 });

        it('should return ok:true and group id if creation succeeds', async () => {
            const id: string = faker.string.uuid();
            oxSendService.send.mockResolvedValueOnce({
                ok: true,
                value: { id: id },
            });

            const result: Result<OXGroupID, Error> = await sut.createOxGroup(oxGroupName, displayName);
            expect(result).toEqual({ ok: true, value: id });
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(`Successfully Created OxGroup, oxGroupId:${id}`),
            );
        });

        it('should log error and return result if creation fails', async () => {
            const error: OxGroupNameAmbiguousError = new OxGroupNameAmbiguousError('');
            oxSendService.send.mockResolvedValueOnce({
                ok: false,
                error,
            });

            const result: Result<OXGroupID, Error> = await sut.createOxGroup(oxGroupName, displayName);
            expect(result).toEqual({ ok: false, error });
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Could Not Create OxGroup with name:${oxGroupName}, displayName:${displayName}`,
                ),
            );
        });
    });

    describe('addOxUserToGroup', () => {
        const oxUserId: string = faker.string.alphanumeric({ length: 6 });
        const schuleDstrNr: string = faker.string.alphanumeric({ length: 6 });
        const oxGroupId: string = faker.string.alphanumeric({ length: 6 });

        it('should log error if group lookup fails', async () => {
            vi.spyOn(sut, 'getExistingOxGroupByNameOrCreateOxGroup').mockResolvedValueOnce({
                ok: false,
                error: new Error('fail'),
            });

            await sut.addOxUserToGroup(oxUserId, schuleDstrNr);

            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Could not get OxGroup for schulenDstNr:${schuleDstrNr}`),
            );
        });

        it('should log error if adding member fails with non-OxMemberAlreadyInGroupError', async () => {
            vi.spyOn(sut, 'getExistingOxGroupByNameOrCreateOxGroup').mockResolvedValueOnce({
                ok: true,
                value: oxGroupId,
            });
            vi.spyOn(sut, 'createAddMemberToGroupAction').mockReturnValue({} as AddMemberToGroupAction);
            oxSendService.send.mockResolvedValueOnce({ ok: false, error: new OxGroupNotFoundError('') });

            await sut.addOxUserToGroup(oxUserId, schuleDstrNr);

            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining(`Could not add oxUser to oxGroup, schulenDstNr:${schuleDstrNr}`),
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Successfully added oxUser to oxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                ),
            );
        });

        it('should not log error if adding member fails with OxMemberAlreadyInGroupError', async () => {
            vi.spyOn(sut, 'getExistingOxGroupByNameOrCreateOxGroup').mockResolvedValueOnce({
                ok: true,
                value: oxGroupId,
            });
            vi.spyOn(sut, 'createAddMemberToGroupAction').mockReturnValue({} as AddMemberToGroupAction);
            oxSendService.send.mockResolvedValueOnce({
                ok: false,
                error: new OxMemberAlreadyInGroupError('already in group'),
            });

            await sut.addOxUserToGroup(oxUserId, schuleDstrNr);

            expect(loggerMock.error).not.toHaveBeenCalledWith(
                expect.stringContaining(`Could not add oxUser to oxGroup, schulenDstNr:${schuleDstrNr}`),
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Successfully added oxUser to oxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                ),
            );
        });

        it('should add user to group and log info on success', async () => {
            vi.spyOn(sut, 'getExistingOxGroupByNameOrCreateOxGroup').mockResolvedValueOnce({
                ok: true,
                value: oxGroupId,
            });
            vi.spyOn(sut, 'createAddMemberToGroupAction').mockReturnValue({} as AddMemberToGroupAction);
            oxSendService.send.mockResolvedValueOnce({ ok: true, value: {} });

            await sut.addOxUserToGroup(oxUserId, schuleDstrNr);

            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining(
                    `Successfully added oxUser to oxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
                ),
            );
        });
    });

    describe('getExistingOxGroupByNameOrCreateOxGroup', () => {
        const oxGroupName: string = faker.string.alphanumeric({ length: 6 });
        const displayName: string = faker.string.alphanumeric({ length: 6 });

        it('should return ok:true if group exists', async () => {
            vi.spyOn(sut, 'getOxGroupByName').mockResolvedValueOnce({ ok: true, value: 'groupId' });

            const result: Result<OXGroupID, Error> = await sut.getExistingOxGroupByNameOrCreateOxGroup(
                oxGroupName,
                displayName,
            );
            expect(result).toEqual({ ok: true, value: 'groupId' });
        });

        it('should create group if not found', async () => {
            vi.spyOn(sut, 'getOxGroupByName').mockResolvedValueOnce({
                ok: false,
                error: new OxGroupNotFoundError(oxGroupName),
            });
            vi.spyOn(sut, 'createOxGroup').mockResolvedValueOnce({ ok: true, value: 'newGroupId' });

            const result: Result<OXGroupID, Error> = await sut.getExistingOxGroupByNameOrCreateOxGroup(
                oxGroupName,
                displayName,
            );
            expect(result).toEqual({ ok: true, value: 'newGroupId' });
        });

        it('should return error if getOxGroupByName returns DomainError (not NotFound)', async () => {
            const error: OxGroupNameAmbiguousError = new OxGroupNameAmbiguousError(oxGroupName);
            vi.spyOn(sut, 'getOxGroupByName').mockResolvedValueOnce({ ok: false, error });

            const result: Result<OXGroupID, Error> = await sut.getExistingOxGroupByNameOrCreateOxGroup(
                oxGroupName,
                displayName,
            );
            expect(result).toEqual({ ok: false, error });
        });
    });

    describe('getOxGroupByName', () => {
        const oxGroupName: string = faker.string.alphanumeric({ length: 6 });

        it('should return group id if exactly one group is found', async () => {
            const groupId: string = faker.string.uuid();
            oxSendService.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    groups: [
                        {
                            id: groupId,
                            displayname: faker.string.alphanumeric({ length: 6 }),
                            name: oxGroupName,
                            memberIds: [],
                        },
                    ],
                },
            });

            const result: Result<OXGroupID, Error> = await sut.getOxGroupByName(oxGroupName);
            expect(result.ok).toBe(true);
            if (!result.ok) {
                return;
            }
            expect(result.value).toBe(groupId);
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Found existing oxGroup for oxGroupName:' + oxGroupName),
            );
        });

        it('should return OxGroupNotFoundError if no groups found', async () => {
            oxSendService.send.mockResolvedValueOnce({
                ok: true,
                value: { groups: [] },
            });

            const result: Result<OXGroupID, Error> = await sut.getOxGroupByName(oxGroupName);
            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error).toBeInstanceOf(OxGroupNotFoundError);
            expect(loggerMock.info).toHaveBeenCalledWith(
                expect.stringContaining('Found No Matching OxGroup For OxGroupName:' + oxGroupName),
            );
        });

        it('should return OxGroupNameAmbiguousError if multiple groups found', async () => {
            oxSendService.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    groups: [
                        {
                            id: faker.string.uuid(),
                            displayname: faker.string.alphanumeric({ length: 6 }),
                            name: oxGroupName,
                            memberIds: [],
                        },
                        {
                            id: faker.string.uuid(),
                            displayname: faker.string.alphanumeric({ length: 6 }),
                            name: oxGroupName,
                            memberIds: [],
                        },
                    ],
                },
            });

            const result: Result<OXGroupID, Error> = await sut.getOxGroupByName(oxGroupName);
            expect(result.ok).toBe(false);
            if (result.ok) {
                return;
            }
            expect(result.error).toBeInstanceOf(OxGroupNameAmbiguousError);
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Found multiple OX-groups For OxGroupName:' + oxGroupName),
            );
        });

        it('should return error if oxSendService.send fails', async () => {
            const error: OxGroupNotFoundError = new OxGroupNotFoundError('');
            oxSendService.send.mockResolvedValueOnce({ ok: false, error });

            const result: Result<OXGroupID, Error> = await sut.getOxGroupByName(oxGroupName);
            expect(result.ok).toBe(false);
            expect(loggerMock.error).toHaveBeenCalledWith(
                expect.stringContaining('Could Not Retrieve Groups For Context'),
            );
        });
    });

    describe('OxService action creators', () => {
        it('createChangeUserAction returns ChangeUserAction', () => {
            const action: ChangeUserAction = sut.createChangeUserAction(
                faker.string.uuid(),
                faker.internet.username(),
                [faker.internet.email()],
                faker.person.firstName(),
                faker.person.lastName(),
                faker.person.fullName(),
                faker.internet.email(),
                faker.internet.email(),
            );
            expect(action).toBeInstanceOf(ChangeUserAction);
        });

        it('createGetDataForUserAction returns GetDataForUserAction', () => {
            const action: GetDataForUserAction = sut.createGetDataForUserAction(faker.string.uuid());
            expect(action).toBeInstanceOf(GetDataForUserAction);
        });

        it('createDeleteUserAction returns DeleteUserAction', () => {
            const action: DeleteUserAction = sut.createDeleteUserAction(faker.string.uuid());
            expect(action).toBeInstanceOf(DeleteUserAction);
        });

        it('createAddMemberToGroupAction returns AddMemberToGroupAction', () => {
            const action: AddMemberToGroupAction = sut.createAddMemberToGroupAction(
                faker.string.uuid(),
                faker.string.uuid(),
            );
            expect(action).toBeInstanceOf(AddMemberToGroupAction);
        });

        it('createExistsUserAction returns ExistsUserAction', () => {
            const action: ExistsUserAction = sut.createExistsUserAction(faker.internet.username());
            expect(action).toBeInstanceOf(ExistsUserAction);
        });

        it('createCreateUserAction returns CreateUserAction', () => {
            const action: CreateUserAction = sut.createCreateUserAction({
                displayName: faker.person.fullName(),
                username: faker.internet.username(),
                firstname: faker.person.firstName(),
                lastname: faker.person.lastName(),
                primaryEmail: faker.internet.email(),
            });
            expect(action).toBeInstanceOf(CreateUserAction);
        });

        it('createChangeByModuleAccessAction returns ChangeByModuleAccessAction', () => {
            const action: ChangeByModuleAccessAction = sut.createChangeByModuleAccessAction(faker.string.uuid());
            expect(action).toBeInstanceOf(ChangeByModuleAccessAction);
        });
    });

    describe('setUserOxGroups', () => {
        function makeOxGroup(): OXGroup {
            return {
                id: faker.string.uuid(),
                displayname: faker.string.alphanumeric(10),
                name: faker.string.alphanumeric(10),
                memberIds: [],
            };
        }

        it('should return early if removeOxUserFromGroup fails for a group', async () => {
            const oxUserId: string = faker.string.numeric(5);
            const oldGroup: OXGroup = {
                id: faker.string.uuid(),
                displayname: faker.string.alphanumeric(10),
                name: faker.string.alphanumeric(10),
                memberIds: [],
            };
            const errorResult: Result<void, Error> = { ok: false, error: new Error('remove failed') };

            // Only one group to remove, and it will fail
            oxSendService.send.mockResolvedValueOnce(Ok({ groups: [oldGroup] }));
            const addOxUserToGroupSpy: Mock = vi
                .spyOn(sut, 'addOxUserToGroup')
                .mockResolvedValue({ ok: true, value: undefined });
            const removeOxUserFromGroupSpy: Mock = vi
                .spyOn(sut, 'removeOxUserFromGroup')
                .mockResolvedValueOnce(errorResult);

            const result: Result<void, Error> = await sut.setUserOxGroups(oxUserId, []);

            expect(addOxUserToGroupSpy).not.toHaveBeenCalled();
            expect(removeOxUserFromGroupSpy).toHaveBeenCalledWith(oxUserId, oldGroup.id);
            expect(result).toBe(errorResult);
        });

        it('should do stuff', async () => {
            const oldGroup: OXGroup = makeOxGroup();
            const newGroup: OXGroup = makeOxGroup();
            const groups: OXGroup[] = [oldGroup];
            const oxUser: string = faker.string.numeric(5);

            const addOxUserToGroupSpy: Mock = vi
                .spyOn(sut, 'addOxUserToGroup')
                .mockResolvedValueOnce({ ok: true, value: undefined });
            const removeOxUserFromGroupSpy: Mock = vi
                .spyOn(sut, 'removeOxUserFromGroup')
                .mockResolvedValueOnce({ ok: true, value: undefined });

            oxSendService.send.mockResolvedValueOnce(Ok({ groups }));

            await sut.setUserOxGroups(oxUser, [newGroup.name]);

            expect(addOxUserToGroupSpy).toHaveBeenCalledWith(oxUser, newGroup.name);
            expect(removeOxUserFromGroupSpy).toHaveBeenCalledWith(oxUser, oldGroup.id);
        });

        it('should log error if groups can not be retrieved', async () => {
            const oxUser: string = faker.string.numeric(5);
            oxSendService.send.mockResolvedValueOnce(Err(new OxError()));

            await sut.setUserOxGroups(oxUser, []);

            expect(loggerMock.error).toHaveBeenLastCalledWith(`Could not get groups for ox user ${oxUser}`);
        });
    });

    describe('removeOxUserFromGroup', () => {
        it('should log on success', async () => {
            const oxUserId: string = faker.string.numeric(5);
            const oxGroupId: string = faker.string.uuid();

            oxSendService.send.mockResolvedValueOnce(Ok(undefined));

            await sut.removeOxUserFromGroup(oxUserId, oxGroupId);

            expect(loggerMock.info).toHaveBeenCalledWith(
                `Successfully removed oxUser from oxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupId}`,
            );
        });

        it('should log on error', async () => {
            const oxUserId: string = faker.string.numeric(5);
            const oxGroupId: string = faker.string.uuid();
            const error: OxError = new OxError();

            oxSendService.send.mockResolvedValueOnce(Err(error));

            await sut.removeOxUserFromGroup(oxUserId, oxGroupId);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Could not remove oxUser from oxGroup, oxUserId:${oxUserId} oxGroupId:${oxGroupId}`,
                error,
            );
        });
    });

    describe('deleteUser', () => {
        it('should log and return ok if deletion succeeds', async () => {
            const oxUserCounter: string = faker.string.uuid();
            oxSendService.send.mockResolvedValueOnce({ ok: true, value: undefined });

            const result: Result<void, Error> = await sut.deleteUser(oxUserCounter);

            expect(oxSendService.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    params: expect.objectContaining({ userId: oxUserCounter }),
                }),
            );
            expect(loggerMock.info).toHaveBeenCalledWith(`Successfully Deleted OxUser :${oxUserCounter}`);
            expect(result).toEqual({ ok: true, value: undefined });
        });

        it('should log error and return result if deletion fails', async () => {
            const oxUserCounter: string = faker.string.uuid();
            const error: OxError = new OxError('');
            oxSendService.send.mockResolvedValueOnce({ ok: false, error: error });

            const result: Result<void, Error> = await sut.deleteUser(oxUserCounter);

            expect(oxSendService.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    params: expect.objectContaining({ userId: oxUserCounter }),
                }),
            );
            expect(loggerMock.error).toHaveBeenCalledWith(`Could Not Delete OxUser :${oxUserCounter}`);
            expect(result).toEqual({ ok: false, error });
        });
    });

    describe('getOxGroupsForOxUserId', () => {
        it('should log info and return result if retrieval succeeds', async () => {
            const oxUserId: string = faker.string.uuid();
            const response: unknown = { groups: [] };
            oxSendService.send.mockResolvedValueOnce({ ok: true, value: response });

            const result: Result<ListGroupsForUserResponse, Error> = await sut.getOxGroupsForOxUserId(oxUserId);

            expect(oxSendService.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    params: expect.objectContaining({ userId: oxUserId }),
                }),
            );
            expect(loggerMock.info).toHaveBeenCalledWith(
                `Successfully Retrieved OxGroups For OxUser, oxUserId:${oxUserId}`,
            );
            expect(result).toEqual({ ok: true, value: response });
        });

        it('should log error and return result if retrieval fails', async () => {
            const oxUserId: string = faker.string.uuid();
            const error: OxError = new OxError('fail');
            oxSendService.send.mockResolvedValueOnce({ ok: false, error });

            const result: Result<ListGroupsForUserResponse, Error> = await sut.getOxGroupsForOxUserId(oxUserId);

            expect(oxSendService.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    params: expect.objectContaining({ userId: oxUserId }),
                }),
            );
            expect(loggerMock.error).toHaveBeenCalledWith(
                `Could Not Retrieve OxGroups For OxUser, oxUserId:${oxUserId}`,
            );
            expect(result).toEqual({ ok: false, error });
        });
    });

    describe('useOx should return correct value based on config', () => {
        it('should return false when OX.ENABLED is false', () => {
            const sut: OxAdapter = new OxAdapter(
                createMock(ClassLogger),
                createMock(OxSendService),
                createMock(EmailAppConfig, {
                    OX: {
                        ENABLED: false,
                        USERNAME: '',
                        PASSWORD: '',
                        CONTEXT_ID: '',
                        ENDPOINT: '',
                        CONTEXT_NAME: '',
                        USER_PASSWORD_DEFAULT: '',
                    },
                }),
            );
            expect(sut.useOx()).toBe(false);
        });

        it('should return true when OX.ENABLED is true', () => {
            const sut: OxAdapter = new OxAdapter(
                createMock(ClassLogger),
                createMock(OxSendService),
                createMock(EmailAppConfig, {
                    OX: {
                        ENABLED: true,
                        USERNAME: '',
                        PASSWORD: '',
                        CONTEXT_ID: '',
                        ENDPOINT: '',
                        CONTEXT_NAME: '',
                        USER_PASSWORD_DEFAULT: '',
                    },
                }),
            );
            expect(sut.useOx()).toBe(true);
        });
    });
});
