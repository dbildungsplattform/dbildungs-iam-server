import { forwardRef, Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { PersonService } from './domain/person.service.js';
import { UsernameGeneratorService } from './domain/username-generator.service.js';
import { KeycloakAdministrationModule } from '../keycloak-administration/keycloak-administration.module.js';
import { PersonRepository } from './persistence/person.repository.js';
import { PersonFactory } from './domain/person.factory.js';
import { OrganisationRepository } from '../organisation/persistence/organisation.repository.js';
import { EventModule } from '../../core/eventbus/event.module.js';
import { OxUserBlacklistRepo } from './persistence/ox-user-blacklist.repo.js';
import PersonTimeLimitService from './domain/person-time-limit-info.service.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { EmailResolverModule } from '../email-resolver/email-resolver.module.js';

@Module({
    imports: [
        KeycloakAdministrationModule,
        LoggerModule.register(PersonModule.name),
        EventModule,
        EmailResolverModule,
        forwardRef(() => PersonenKontextModule),
    ],
    providers: [
        PersonRepository,
        PersonService,
        PersonFactory,
        UsernameGeneratorService,
        OrganisationRepository,
        OxUserBlacklistRepo,
        PersonTimeLimitService,
    ],
    exports: [PersonService, PersonFactory, PersonRepository, PersonTimeLimitService],
})
export class PersonModule {}
