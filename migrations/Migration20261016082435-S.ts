import { Migration } from '@mikro-orm/migrations';

export class Migration20261016082435 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "schulconnex_push_registry" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "service_provider_id" uuid not null, "base_url" text not null, primary key ("id"));`);

    this.addSql(`alter table "schulconnex_push_registry" add constraint "schulconnex_push_registry_service_provider_id_foreign" foreign key ("service_provider_id") references "service_provider" ("id") on update cascade on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "schulconnex_push_registry" cascade;`);
  }

}
