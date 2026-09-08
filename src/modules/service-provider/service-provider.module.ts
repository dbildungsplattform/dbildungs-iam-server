import { forwardRef, Module } from '@nestjs/common';
import { EventModule } from '../../core/eventbus/event.module.js';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { KeycloakAdministrationModule } from '../keycloak-administration/keycloak-administration.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { ServiceProviderFactory } from './domain/service-provider.factory.js';
import { ServiceProviderFindService } from './domain/service-provider-find.service.js';
import { ServiceProviderModificationService } from './domain/service-provider-modification.service.js';
import { ServiceProviderService } from './domain/service-provider.service.js';
import { CreateGroupAndRoleHandler } from './repo/service-provider-event-handler.js';
import { ServiceProviderRepo } from './repo/service-provider.repo.js';
import { ServiceProviderInternalRepo } from './repo/service-provider.internal.repo.js';
import { OrganisationServiceProviderRepo } from './repo/organisation-service-provider.repo.js';
import { OrganisationModule } from '../organisation/organisation.module.js';

@Module({
    imports: [
        LoggerModule.register(ServiceProviderModule.name),
        KeycloakAdministrationModule,
        EventModule,
        forwardRef(() => RolleModule),
        OrganisationModule,
    ],
    providers: [
        ServiceProviderRepo,
        ServiceProviderInternalRepo,
        ServiceProviderFactory,
        ServiceProviderFindService,
        ServiceProviderModificationService,
        ServiceProviderService,
        CreateGroupAndRoleHandler,
        OrganisationServiceProviderRepo,
    ],
    exports: [
        ServiceProviderRepo,
        ServiceProviderFactory,
        ServiceProviderFindService,
        ServiceProviderModificationService,
        ServiceProviderService,
    ],
})
export class ServiceProviderModule {}
