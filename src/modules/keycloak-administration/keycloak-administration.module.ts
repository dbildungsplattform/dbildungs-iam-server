import { Module } from '@nestjs/common';

import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';

import { EventModule } from '../../core/eventbus/event.module.js';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { KeycloakGroupRoleService } from './domain/keycloak-group-role.service.js';
import { KeycloakUserService } from './domain/keycloak-user.service.js';
import { KeycloakConfigModule } from './keycloak-config.module.js';

import { CreateGroupAndRoleHandler } from '../service-provider/repo/service-provider-event-handler.js';
import { KeycloakAdministrationService } from './domain/keycloak-admin-client.service.js';
import { KeycloakServiceApiClient } from './keycloak-client-providers.js';
import { UserLockRepository } from './repository/user-lock.repository.js';

@Module({
    imports: [LoggerModule.register(KeycloakAdministrationModule.name), KeycloakConfigModule, EventModule],
    providers: [
        KeycloakServiceApiClient,
        KeycloakAdminClient,
        KeycloakUserService,
        KeycloakGroupRoleService,
        KeycloakAdministrationService,
        CreateGroupAndRoleHandler,
        UserLockRepository,
    ],
    exports: [KeycloakUserService, KeycloakGroupRoleService, UserLockRepository],
})
export class KeycloakAdministrationModule {}
