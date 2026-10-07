import { Migration } from '@mikro-orm/migrations';

export class Migration20260903120000 extends Migration {
    override up(): void | Promise<void> {
        this.addSql(
            `update "organisation" set "uem_ldap_ou" = "oeffentlicheSchulen" where "uem_ldap_ou"="qs.schule-sh.de";`,
        );
        this.addSql(
            `update "organisation" set "uem_ldap_ou" = "oeffentlicheSchulen" where "uem_ldap_ou"="schule-sh.de";`,
        );
        this.addSql(
            `update "organisation" set "uem_ldap_ou" = "ersatzSchulen" where "uem_ldap_ou"="qs.ersatzschule-sh.de";`,
        );
        this.addSql(
            `update "organisation" set "uem_ldap_ou" = "ersatzSchulen" where "uem_ldap_ou"="ersatzschule-sh.de";`,
        );
    }

    override down(): void | Promise<void> {
        this.addSql(
            `update "organisation" set "uemldapou" = "qs.schule-sh.de" where "uemldapou"="oeffentlicheSchulen";`,
        );
        this.addSql(`update "organisation" set "uemldapou" = "schule-sh.de" where "uemldapou"="oeffentlicheSchulen";`);
        this.addSql(
            `update "organisation" set "uemldapou" = "qs.ersatzschule-sh.de" where "uemldapou"="ersatzSchulen";`,
        );
        this.addSql(`update "organisation" set "uemldapou" = "ersatzschule-sh.de" where "uemldapou"="ersatzSchulen";`);
    }
}
