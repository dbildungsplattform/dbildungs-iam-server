import { Migration } from '@mikro-orm/migrations';

export class Migration20261127074245 extends Migration {
    public override up(): void {
        this.addSql(
            'alter table "schulconnex_push_registry" add column "oidc_token_endpoint" text null, add column "oidc_client_id" text null, add column "oidc_client_secret_ref" text null;',
        );
    }

    public override down(): void {
        this.addSql(
            'alter table "schulconnex_push_registry" drop column "oidc_token_endpoint", drop column "oidc_client_id", drop column "oidc_client_secret_ref";',
        );
    }
}
