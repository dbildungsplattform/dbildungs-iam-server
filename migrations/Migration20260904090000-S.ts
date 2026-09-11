import { Migration } from '@mikro-orm/migrations';

export class Migration20260904090000 extends Migration {
    public async up(): Promise<void> {
        this.addSql(`alter type "service_provider_system_enum" add value if not exists 'UEM' after 'ITSLEARNING';`);
        this.addSql(`alter type "service_provider_target_enum" add value if not exists 'NONE' before 'URL';`);
    }

    public override async down(): Promise<void> {
        // Enum values cannot be removed from a PostgreSQL native enum without recreating the type, so this is a no-op.
    }
}
