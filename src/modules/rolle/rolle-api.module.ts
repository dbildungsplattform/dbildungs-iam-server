import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logging/logger.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { RolleController } from './api/rolle.controller.js';
import { RolleModule } from './rolle.module.js';
import { ServiceProviderModule } from '../service-provider/service-provider.module.js';
import { PersonModule } from '../person/person.module.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { RollenerweiterungController } from './api/rollenerweiterung.controller.js';
import { ApplyRollenerweiterungForAngebotService } from './domain/apply-rollenerweiterungen-for-angebot-service.js';
import { ApplyRollenerweiterungForRolleService } from './domain/apply-rollenerweiterungen-for-rolle-service.js';

@Module({
    imports: [
        RolleModule,
        OrganisationModule,
        PersonModule,
        ServiceProviderModule,
        PersonenKontextModule,
        LoggerModule.register(RolleApiModule.name),
    ],
    providers: [ApplyRollenerweiterungForAngebotService, ApplyRollenerweiterungForRolleService],
    controllers: [RolleController, RollenerweiterungController],
})
export class RolleApiModule {}
