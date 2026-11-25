import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { EmailResolverModule } from '../email-resolver/email-resolver.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RolleModule } from '../rolle/rolle.module.js';
import { PersonPermissionsRepo } from './domain/person-permission.repo.js';
import { UserExternaldataService } from './domain/user-externaldata.service.js';

@Module({
    imports: [
        LoggerModule.register(AuthenticationModule.name),
        PersonModule,
        PersonenKontextModule,
        OrganisationModule,
        RolleModule,
        EmailResolverModule,
    ],
    providers: [PersonPermissionsRepo, UserExternaldataService],
    exports: [PersonPermissionsRepo, UserExternaldataService],
})
export class AuthenticationModule {}
