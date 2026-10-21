import { Injectable } from '@nestjs/common';
import { Organisation } from '../../organisation/domain/organisation.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { Ok } from '../../../shared/util/result.js';
import { InternalRollenerweiterungRepo } from '../repo/internal-rollenerweiterung.repo.js';
import { Rolle } from './rolle.js';
import { CreateRollenerweiterungError, Rollenerweiterung } from './rollenerweiterung.js';

@Injectable()
export class InternalRollenerweiterungService {
    public constructor(private readonly internalRollenerweiterungRepo: InternalRollenerweiterungRepo) {}

    public async create(
        organisation: Organisation<true>,
        rolle: Rolle<true>,
        serviceProvider: ServiceProvider<true>,
    ): Promise<Result<Rollenerweiterung<true>, CreateRollenerweiterungError>> {
        const createResult: Result<
            Rollenerweiterung<false>,
            CreateRollenerweiterungError
        > = Rollenerweiterung.createNew(organisation.id, rolle, serviceProvider);

        if (!createResult.ok) {
            return createResult;
        }

        const persistedRollenerweiterung: Rollenerweiterung<true> = await this.internalRollenerweiterungRepo.create(
            createResult.value,
        );

        return Ok(persistedRollenerweiterung);
    }
}
