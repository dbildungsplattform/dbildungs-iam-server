import { Injectable } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';

@Injectable()
export class DatabaseHealthIndicator {
    private static readonly HEALTH_CHECK_KEY: string = 'database';

    public constructor(
        private readonly mikroOrm: MikroORM,
        private readonly healthIndicatorService: HealthIndicatorService,
    ) {}

    public async check(): Promise<HealthIndicatorResult> {
        try {
            await this.mikroOrm.em.fork().getConnection().execute('SELECT 1');

            return this.healthIndicatorService.check(DatabaseHealthIndicator.HEALTH_CHECK_KEY).up();
        } catch (error: unknown) {
            const message: string =
                error instanceof Error
                    ? `Database is not reachable: ${error.message}`
                    : 'Database is not reachable and there is no error message available';

            return this.healthIndicatorService.check(DatabaseHealthIndicator.HEALTH_CHECK_KEY).down({ message });
        }
    }
}
