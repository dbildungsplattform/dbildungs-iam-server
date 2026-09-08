import { Migration } from '@mikro-orm/migrations';

export class Migration20260710072430 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "service_provider_rollenarten_whitelist" ("service_provider_id" uuid not null, "rollenart" "rollen_art_enum" not null, primary key ("service_provider_id", "rollenart"));`);
    this.addSql(`create index "service_provider_rollenarten_whitelist_service_provider_id_index" on "service_provider_rollenarten_whitelist" ("service_provider_id");`);

    this.addSql(`alter table "service_provider_rollenarten_whitelist" add constraint "service_provider_rollenarten_whitelist_service_p_d12ab_foreign" foreign key ("service_provider_id") references "service_provider" ("id") on update cascade on delete no action;`);

    this.addSql(`alter type "service_provider_merkmal_enum" add value if not exists 'ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG' after 'VERFUEGBAR_FUER_ROLLENERWEITERUNG';`);
    this.addSql(`alter type "service_provider_merkmal_enum" add value if not exists 'ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG' after 'ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "service_provider_rollenarten_whitelist" cascade;`);
  }

}
