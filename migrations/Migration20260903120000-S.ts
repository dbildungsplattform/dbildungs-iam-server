import { Migration } from '@mikro-orm/migrations';

export class Migration20260903120000 extends Migration {
    override up(): void | Promise<void> {
        this.addSql(`alter table "public"."service_provider" add column "keycloak_client" varchar(255) null;`);
    }

    override down(): void | Promise<void> {
        this.addSql(`alter table "public"."service_provider" drop column "keycloak_client";`);
    }
}
