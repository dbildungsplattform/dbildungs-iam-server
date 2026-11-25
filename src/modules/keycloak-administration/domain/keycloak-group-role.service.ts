import { Injectable } from '@nestjs/common';
import { GroupRepresentation, KeycloakAdminClient, RoleRepresentation } from '@s3pweb/keycloak-admin-client-cjs';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError, KeycloakClientError } from '../../../shared/error/index.js';
import { KeycloakAdministrationService } from './keycloak-admin-client.service.js';

@Injectable()
export class KeycloakGroupRoleService {
    public constructor(
        private readonly kcAdminService: KeycloakAdministrationService,
        private readonly logger: ClassLogger,
    ) {}

    public async createGroup(group: string): Promise<Result<string, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        const groupName: string = group;
        const [existingGroup]: GroupRepresentation[] = await kcAdminClientResult.value.groups.find({
            search: groupName,
        });

        if (existingGroup) {
            this.logger.info(`Group already exists: ${groupName}`);
            return { ok: false, error: new KeycloakClientError('Group name already exists') };
        }

        try {
            const groupRepresentation: GroupRepresentation = {
                name: groupName,
            };

            const response: { id: string } = await kcAdminClientResult.value.groups.create(groupRepresentation);
            this.logger.info(`keycloack group created:  ${groupName}`);
            return { ok: true, value: response.id };
        } catch (err) {
            this.logger.logUnknownAsError('Could not create group', err);
            return { ok: false, error: new KeycloakClientError('Could not create group') };
        }
    }

    public async createRole(role: string): Promise<Result<string, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        try {
            const roleName: string = role;
            const existingRole: RoleRepresentation | undefined = await kcAdminClientResult.value.roles.findOneByName({
                name: roleName,
            });

            if (existingRole) {
                this.logger.info(`Role already exists: ${roleName}`);
                return { ok: false, error: new KeycloakClientError('Role name already exists') };
            }

            const roleRepresentation: RoleRepresentation = {
                name: roleName,
            };

            const response: { roleName: string } = await kcAdminClientResult.value.roles.create(roleRepresentation);
            this.logger.info(`Keycloak role created: ${roleName}`);
            return { ok: true, value: response.roleName };
        } catch (err) {
            this.logger.logUnknownAsError('Could not create role', err);
            return { ok: false, error: new KeycloakClientError('Could not create role') };
        }
    }

    public async addRoleToGroup(groupId: string, createdRole: string): Promise<Result<boolean, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        try {
            const roleName: string = createdRole;
            const role: RoleRepresentation | undefined = await kcAdminClientResult.value.roles.findOneByName({
                name: roleName,
            });

            if (!role || !role.id || !role.name) {
                this.logger.error(`Role not found or id/name is undefined for: ${roleName}`);
                return { ok: false, error: new KeycloakClientError('Role not found or id/name is undefined') };
            }

            await kcAdminClientResult.value.groups.addRealmRoleMappings({
                id: groupId,
                roles: [
                    {
                        id: role.id,
                        name: role.name,
                    },
                ],
            });

            this.logger.info(`Role ${roleName} added to group with ID: ${groupId}`);
            return { ok: true, value: true };
        } catch (err) {
            this.logger.logUnknownAsError('Could not add role to group', err);
            return { ok: false, error: new KeycloakClientError('Could not add role to group') };
        }
    }
}
