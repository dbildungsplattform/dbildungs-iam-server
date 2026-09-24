import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { ExternalDataCacheInterceptor } from '../../shared/cache/external-data-cache-interceptor.js';
import { EmailMicroserviceModule } from '../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../email/email-persistence.module.js';
import { KeycloakAdministrationModule } from '../keycloak-administration/keycloak-administration.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { AuthenticationController } from './api/authentication.controller.js';
import { CsrfProtectionGuard } from './api/csrf-token.guard.js';
import { KeycloakInternalController } from './api/keycloakinternal.controller.js';
import { AuthenticationModule } from './authentication.module.js';
import { PersonPermissionsRepo } from './domain/person-permission.repo.js';
import { UserExternaldataWorkflowFactory } from './domain/user-extenaldata.factory.js';
import { InternalCommunicationApiKeyStrategy } from './passport/internalcommunicationapikey.strategy.js';
import { JwtStrategy } from './passport/jwt.strategy.js';
import { OpenIdConnectStrategy } from './passport/oidc.strategy.js';
import { SessionSerializer } from './passport/session.serializer.js';
import { CsrfTokenService } from './services/csrf-token.service.js';
import { OIDCClientProvider } from './services/oidc-client.service.js';
import { SessionAccessTokenMiddleware } from './services/session-access-token.middleware.js';

@Module({
    imports: [
        HttpModule,
        LoggerModule.register(AuthenticationApiModule.name),
        PersonModule,
        PersonenKontextModule,
        OrganisationModule,
        RolleModule,
        KeycloakAdministrationModule,
        EmailMicroserviceModule,
        EmailPersistenceModule,
        AuthenticationModule,
    ],
    providers: [
        OpenIdConnectStrategy,
        JwtStrategy,
        InternalCommunicationApiKeyStrategy,
        SessionSerializer,
        OIDCClientProvider,
        PersonPermissionsRepo,
        SessionAccessTokenMiddleware,
        UserExternaldataWorkflowFactory,
        ExternalDataCacheInterceptor,
        CsrfTokenService,
        {
            provide: APP_GUARD,
            useClass: CsrfProtectionGuard,
        },
    ],
    controllers: [AuthenticationController, KeycloakInternalController],
    exports: [OIDCClientProvider, PersonPermissionsRepo],
})
export class AuthenticationApiModule {}
