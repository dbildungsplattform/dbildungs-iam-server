import { Module } from '@nestjs/common';

import { KeycloakAdminClient } from '@s3pweb/keycloak-admin-client-cjs';

import { EventModule } from '../../core/eventbus/event.module.js';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { KeycloakUserService } from './domain/keycloak-user.service.js';
import { KeycloakConfigModule } from './keycloak-config.module.js';

import { KeycloakAdministrationService } from './domain/keycloak-admin-client.service.js';
import { KeycloakServiceApiClient } from './keycloak-client-providers.js';
import { UserLockRepository } from './repository/user-lock.repository.js';

@Module({
    imports: [LoggerModule.register(KeycloakAdministrationModule.name), KeycloakConfigModule, EventModule],
    providers: [
        KeycloakServiceApiClient,
        KeycloakAdminClient,
        KeycloakUserService,
        KeycloakAdministrationService,
        UserLockRepository,
    ],
    exports: [KeycloakUserService, UserLockRepository],
})
export class KeycloakAdministrationModule {}
