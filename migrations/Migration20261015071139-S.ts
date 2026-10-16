import { Migration } from '@mikro-orm/migrations';

export class Migration20261015071139 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create type "organisationsbeziehungs_typ_enum" as enum ('SCHULTRAEGER', 'SCHULAUFSICHT');`);
    this.addSql(`create table "organisationsbeziehung" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "quell_organisation_id" uuid not null, "ziel_organisation_id" uuid not null, "typ" "organisationsbeziehungs_typ_enum" not null, primary key ("id"));`);

    this.addSql(`alter table "organisationsbeziehung" add constraint "organisationsbeziehung_quell_organisation_id_foreign" foreign key ("quell_organisation_id") references "organisation" ("id");`);
    this.addSql(`alter table "organisationsbeziehung" add constraint "organisationsbeziehung_ziel_organisation_id_foreign" foreign key ("ziel_organisation_id") references "organisation" ("id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "organisationsbeziehung" cascade;`);

    this.addSql(`drop type "organisationsbeziehungs_typ_enum";`);
  }

}
