import { MikroORM } from '@mikro-orm/core';
import { CommandRunner, SubCommand } from 'nest-commander';
import { ClassLogger } from '../core/logging/class-logger.js';

@SubCommand({ name: 'init', description: 'initializes the database' })
export class DbInitConsole extends CommandRunner {
    public constructor(
        private readonly orm: MikroORM,
        private readonly logger: ClassLogger,
    ) {
        super();
    }

    public override async run(_passedParams: string[], _options?: Record<string, unknown>): Promise<void> {
        this.logger.info('Initializing database...');

        this.logger.info(this.orm.config.get('clientUrl'));

        await this.orm.schema.ensureDatabase();

        this.logger.info('Dropping Schema');
        await this.orm.schema.drop({ wrap: false });

        this.logger.info('Creating pg_trgm Extension');
        await this.orm.em.getConnection().execute('CREATE EXTENSION IF NOT EXISTS pg_trgm');

        this.logger.info('Creating alphanumeric Collation');
        await this.orm.em
            .getConnection()
            .execute(`CREATE COLLATION IF NOT EXISTS alphanumeric (provider = icu, locale = 'de-u-kn-true')`);

        this.logger.info('Creating Schema');
        await this.orm.schema.create({ wrap: false });

        this.logger.info('Initialized database');
    }
}
