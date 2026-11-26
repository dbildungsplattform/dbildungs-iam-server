import { Migration } from '@mikro-orm/migrations';

export class Migration20261125195500 extends Migration {
    public up(): void {
        this.addSql(`
            create type "service_provider_kategorie_enum_new" as enum (
                'EMAIL',
                'UNTERRICHT',
                'VERWALTUNG',
                'HINWEISE',
                'SCHULISCH',
                'KOMMUNIKATION_UND_ZUSAMMENARBEIT',
                'UNTERRICHT_UND_LERNEN',
                'SCHULORGANISATION_UND_VERWALTUNG',
                'FORTBILDUNG_UND_QUALIFIZIERUNG',
                'INFORMATIONEN_UND_PORTALE',
                'HILFE_UND_UNTERSTUETZUNG'
            );
        `);

        this.addSql(`
            alter table "service_provider"
            alter column "kategorie"
            type "service_provider_kategorie_enum_new"
            using ("kategorie"::text::"service_provider_kategorie_enum_new");
        `);

        this.addSql(`drop type "service_provider_kategorie_enum";`);

        this.addSql(`
            alter type "service_provider_kategorie_enum_new"
            rename to "service_provider_kategorie_enum";
        `);
    }

    // Fails with an explicit error if service providers are still assigned to one of the new categories.
    public override down(): void {
        this.addSql(`lock table "service_provider" in access exclusive mode;`);

        this.addSql(`
            do $$
            begin
                if exists (
                    select 1
                    from "service_provider"
                    where "kategorie"::text not in (
                        'EMAIL',
                        'UNTERRICHT',
                        'VERWALTUNG',
                        'HINWEISE',
                        'SCHULISCH'
                    )
                ) then
                    raise exception 'Cannot roll back: service providers still use new categories.'
                        using hint = 'Reassign affected service providers to an old category first.';
                end if;
            end;
            $$;
        `);

        this.addSql(`
            create type "service_provider_kategorie_enum_new" as enum (
                'EMAIL',
                'UNTERRICHT',
                'VERWALTUNG',
                'HINWEISE',
                'SCHULISCH'
            );
        `);

        this.addSql(`
            alter table "service_provider"
            alter column "kategorie"
            type "service_provider_kategorie_enum_new"
            using ("kategorie"::text::"service_provider_kategorie_enum_new");
        `);

        this.addSql(`drop type "service_provider_kategorie_enum";`);

        this.addSql(`
            alter type "service_provider_kategorie_enum_new"
            rename to "service_provider_kategorie_enum";
        `);
    }
}
