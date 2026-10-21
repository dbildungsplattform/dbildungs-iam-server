import { forwardRef, Module } from '@nestjs/common';

import { LoggerModule } from '../../core/logging/logger.module.js';
import { OrganisationModule } from '../organisation/organisation.module.js';
import { ServiceProviderModule } from '../service-provider/service-provider.module.js';
import { RolleFindService } from './domain/rolle-find.service.js';
import { RolleFactory } from './domain/rolle.factory.js';
import { RollenerweiterungFactory } from './domain/rollenerweiterung.factory.js';
import { RolleRepo } from './repo/rolle.repo.js';
import { RollenerweiterungRepo } from './repo/rollenerweiterung.repo.js';
import { InternalRollenerweiterungRepo } from './repo/internal-rollenerweiterung.repo.js';
import { InternalRollenerweiterungService } from './domain/internal-rollenerweiterung.service.js';

@Module({
    imports: [forwardRef(() => ServiceProviderModule), LoggerModule.register(RolleModule.name), OrganisationModule],
    providers: [
        RolleRepo,
        RolleFactory,
        RolleFindService,
        InternalRollenerweiterungRepo,
        RollenerweiterungRepo,
        InternalRollenerweiterungService,
        RollenerweiterungFactory,
    ],
    exports: [
        RolleRepo,
        RolleFactory,
        RolleFindService,
        RollenerweiterungRepo,
        InternalRollenerweiterungService,
        RollenerweiterungFactory,
    ],
})
export class RolleModule {}
