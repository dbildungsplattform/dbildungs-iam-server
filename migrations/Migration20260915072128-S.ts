import { Migration } from '@mikro-orm/migrations';

export class Migration20260915072128 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "email"."address" alter column "marked_for_cron" set not null;`);
    this.addSql(`alter table "email"."address" alter column "ox_user_counter" set not null;`);

    this.addSql(`alter table "organisation" alter column "administriert_von" set not null;`);
    this.addSql(`alter table "organisation" alter column "email_address" set not null;`);
    this.addSql(`alter table "organisation" alter column "email_domain" set not null;`);
    this.addSql(`alter table "organisation" alter column "kennung" set not null;`);
    this.addSql(`alter table "organisation" alter column "kuerzel" set not null;`);
    this.addSql(`alter table "organisation" alter column "name" set not null;`);
    this.addSql(`alter table "organisation" alter column "namensergaenzung" set not null;`);
    this.addSql(`alter table "organisation" alter column "traegerschaft" set not null;`);
    this.addSql(`alter table "organisation" alter column "typ" set not null;`);
    this.addSql(`alter table "organisation" alter column "zugehoerig_zu" set not null;`);

    this.addSql(`alter table "person" alter column "data_provider_id" set not null;`);
    this.addSql(`alter table "person" alter column "org_unassignment_date" set not null;`);
    this.addSql(`alter table "person" alter column "personalnummer" set not null;`);
    this.addSql(`alter table "person" alter column "stammorganisation" set not null;`);
    this.addSql(`alter table "person" alter column "username" set not null;`);

    this.addSql(`alter table "email_address" alter column "ox_user_id" set not null;`);
    this.addSql(`alter table "email_address" alter column "person_id" set not null;`);

    this.addSql(`alter table "personenkontext" alter column "befristung" set not null;`);
    this.addSql(`alter table "personenkontext" alter column "jahrgangsstufe" set not null;`);
    this.addSql(`alter table "personenkontext" alter column "loeschung_zeitpunkt" set not null;`);
    this.addSql(`alter table "personenkontext" alter column "mandant" set not null;`);
    this.addSql(`alter table "personenkontext" alter column "personenstatus" set not null;`);
    this.addSql(`alter table "personenkontext" alter column "sichtfreigabe" set not null;`);
    this.addSql(`alter table "personenkontext" alter column "username" set not null;`);

    this.addSql(`alter table "importvorgang" alter column "organisation_id" set not null;`);
    this.addSql(`alter table "importvorgang" alter column "person_id" set not null;`);
    this.addSql(`alter table "importvorgang" alter column "rolle_id" set not null;`);

    this.addSql(`alter table "importdataitem" alter column "klasse" set not null;`);
    this.addSql(`alter table "importdataitem" alter column "password" set not null;`);
    this.addSql(`alter table "importdataitem" alter column "personalnummer" set not null;`);
    this.addSql(`alter table "importdataitem" alter column "username" set not null;`);
    this.addSql(`alter table "importdataitem" alter column "validation_errors" set not null;`);

    this.addSql(`alter table "service_provider" alter column "keycloak_group" set not null;`);
    this.addSql(`alter table "service_provider" alter column "keycloak_role" set not null;`);
    this.addSql(`alter table "service_provider" alter column "logo" set not null;`);
    this.addSql(`alter table "service_provider" alter column "logo_id" set not null;`);
    this.addSql(`alter table "service_provider" alter column "logo_mime_type" set not null;`);
    this.addSql(`alter table "service_provider" alter column "url" set not null;`);
    this.addSql(`alter table "service_provider" alter column "vidis_angebot_id" set not null;`);

    this.addSql(`alter table "user_lock" alter column "locked_until" set not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "email"."address" alter column "ox_user_counter" drop not null;`);
    this.addSql(`alter table "email"."address" alter column "marked_for_cron" drop not null;`);

    this.addSql(`alter table "email_address" alter column "person_id" drop not null;`);
    this.addSql(`alter table "email_address" alter column "ox_user_id" drop not null;`);

    this.addSql(`alter table "importdataitem" alter column "klasse" drop not null;`);
    this.addSql(`alter table "importdataitem" alter column "personalnummer" drop not null;`);
    this.addSql(`alter table "importdataitem" alter column "validation_errors" drop not null;`);
    this.addSql(`alter table "importdataitem" alter column "username" drop not null;`);
    this.addSql(`alter table "importdataitem" alter column "password" drop not null;`);

    this.addSql(`alter table "importvorgang" alter column "person_id" drop not null;`);
    this.addSql(`alter table "importvorgang" alter column "rolle_id" drop not null;`);
    this.addSql(`alter table "importvorgang" alter column "organisation_id" drop not null;`);

    this.addSql(`alter table "organisation" alter column "administriert_von" drop not null;`);
    this.addSql(`alter table "organisation" alter column "zugehoerig_zu" drop not null;`);
    this.addSql(`alter table "organisation" alter column "kennung" drop not null;`);
    this.addSql(`alter table "organisation" alter column "name" drop not null;`);
    this.addSql(`alter table "organisation" alter column "namensergaenzung" drop not null;`);
    this.addSql(`alter table "organisation" alter column "kuerzel" drop not null;`);
    this.addSql(`alter table "organisation" alter column "typ" drop not null;`);
    this.addSql(`alter table "organisation" alter column "traegerschaft" drop not null;`);
    this.addSql(`alter table "organisation" alter column "email_domain" drop not null;`);
    this.addSql(`alter table "organisation" alter column "email_address" drop not null;`);

    this.addSql(`alter table "person" alter column "username" drop not null;`);
    this.addSql(`alter table "person" alter column "stammorganisation" drop not null;`);
    this.addSql(`alter table "person" alter column "data_provider_id" drop not null;`);
    this.addSql(`alter table "person" alter column "personalnummer" drop not null;`);
    this.addSql(`alter table "person" alter column "org_unassignment_date" drop not null;`);

    this.addSql(`alter table "personenkontext" alter column "username" drop not null;`);
    this.addSql(`alter table "personenkontext" alter column "mandant" drop not null;`);
    this.addSql(`alter table "personenkontext" alter column "personenstatus" drop not null;`);
    this.addSql(`alter table "personenkontext" alter column "jahrgangsstufe" drop not null;`);
    this.addSql(`alter table "personenkontext" alter column "sichtfreigabe" drop not null;`);
    this.addSql(`alter table "personenkontext" alter column "loeschung_zeitpunkt" drop not null;`);
    this.addSql(`alter table "personenkontext" alter column "befristung" drop not null;`);

    this.addSql(`alter table "service_provider" alter column "url" drop not null;`);
    this.addSql(`alter table "service_provider" alter column "logo_id" drop not null;`);
    this.addSql(`alter table "service_provider" alter column "logo" drop not null;`);
    this.addSql(`alter table "service_provider" alter column "logo_mime_type" drop not null;`);
    this.addSql(`alter table "service_provider" alter column "keycloak_group" drop not null;`);
    this.addSql(`alter table "service_provider" alter column "keycloak_role" drop not null;`);
    this.addSql(`alter table "service_provider" alter column "vidis_angebot_id" drop not null;`);

    this.addSql(`alter table "user_lock" alter column "locked_until" drop not null;`);
  }

}
