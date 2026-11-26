import { Migration } from '@mikro-orm/migrations';

export class Migration20261125080000 extends Migration {
    up(): void {
        this.addSql('alter table "service_provider" drop column "keycloak_group", drop column "keycloak_role";');
    }

    override down(): void {
        this.addSql(
            'alter table "service_provider" add column "keycloak_group" varchar(255) null, add column "keycloak_role" varchar(255) null;',
        );
    }
}
