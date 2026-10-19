import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { KeycloakClientError } from '../../../shared/error/index.js';
import { GroupAndRoleCreatedEvent } from '../../../shared/events/kc-group-and-role-event.js';
import { KeycloakGroupRoleService } from '../../keycloak-administration/domain/keycloak-group-role.service.js';
import { CreateGroupAndRoleHandler } from './service-provider-event-handler.js';

describe('CreateGroupAndRoleHandler', () => {
    let keycloakGroupRoleServiceMock: DeepMocked<KeycloakGroupRoleService>;
    let loggerMock: DeepMocked<ClassLogger>;
    let createGroupAndRoleHandler: CreateGroupAndRoleHandler;

    beforeEach(() => {
        keycloakGroupRoleServiceMock = createMock(KeycloakGroupRoleService);
        loggerMock = createMock(ClassLogger);
        createGroupAndRoleHandler = new CreateGroupAndRoleHandler(keycloakGroupRoleServiceMock, loggerMock);
    });

    describe('handleCreateGroupAndRoleEvent', () => {
        const groupName: string = 'testGroup';
        const roleName: string = 'testRole';
        const groupId: string = 'groupId';
        const encodedRoleName: string = encodeURIComponent(roleName);
        const event: GroupAndRoleCreatedEvent = new GroupAndRoleCreatedEvent(groupName, roleName);

        it('should successfully create group, role, and add role to group', async () => {
            keycloakGroupRoleServiceMock.createGroup.mockResolvedValue({ ok: true, value: groupId });
            keycloakGroupRoleServiceMock.createRole.mockResolvedValue({ ok: true, value: encodedRoleName });
            keycloakGroupRoleServiceMock.addRoleToGroup.mockResolvedValue({ ok: true, value: true });

            await createGroupAndRoleHandler.handleCreateGroupAndRoleEvent(event);

            expect(keycloakGroupRoleServiceMock.createGroup).toHaveBeenCalledWith(groupName);
            expect(keycloakGroupRoleServiceMock.createRole).toHaveBeenCalledWith(roleName);
            expect(keycloakGroupRoleServiceMock.addRoleToGroup).toHaveBeenCalledWith(groupId, roleName);
            expect(loggerMock.error).not.toHaveBeenCalled();
        });

        it('should log an error if creating the group fails', async () => {
            keycloakGroupRoleServiceMock.createGroup.mockResolvedValue({
                ok: false,
                error: new KeycloakClientError('Group creation failed'),
            });

            await createGroupAndRoleHandler.handleCreateGroupAndRoleEvent(event);

            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Could not create group'));
        });

        it('should log an error if creating the role fails', async () => {
            keycloakGroupRoleServiceMock.createGroup.mockResolvedValue({ ok: true, value: groupId });
            keycloakGroupRoleServiceMock.createRole.mockResolvedValue({
                ok: false,
                error: new KeycloakClientError('Role creation failed'),
            });

            await createGroupAndRoleHandler.handleCreateGroupAndRoleEvent(event);

            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Could not create role'));
        });

        it('should log an error if adding role to group fails', async () => {
            keycloakGroupRoleServiceMock.createGroup.mockResolvedValue({ ok: true, value: groupId });
            keycloakGroupRoleServiceMock.createRole.mockResolvedValue({ ok: true, value: encodedRoleName });
            keycloakGroupRoleServiceMock.addRoleToGroup.mockResolvedValue({
                ok: false,
                error: new KeycloakClientError('Add role to group failed'),
            });

            await createGroupAndRoleHandler.handleCreateGroupAndRoleEvent(event);

            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('Could not add role to group'));
        });
    });
});
