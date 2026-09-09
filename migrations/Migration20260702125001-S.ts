import { Migration } from '@mikro-orm/migrations';

export class Migration20260702125001 extends Migration {
    override up(): void | Promise<void> {
        this.addSql(
            `alter type "rollen_system_recht_enum" add value if not exists 'MPT_ROLLEN_VERWALTEN' after 'ROLLEN_VERWALTEN';`,
        );
    }

    override down(): void | Promise<void> {}
}
