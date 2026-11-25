import { Migration } from '@mikro-orm/migrations';

export class Migration20261125110145 extends Migration {
    override up(): void | Promise<void> {
        this.addSql(`alter table "organisation" drop column "zugehoerig_zu";`);
    }

    override down(): void | Promise<void> {
        this.addSql(`alter table "organisation" add "zugehoerig_zu" uuid null;`);
    }
}
