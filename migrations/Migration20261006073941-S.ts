import { Migration } from '@mikro-orm/migrations';

export class Migration20261006073941 extends Migration {
    override up(): void | Promise<void> {
        this.addSql(`alter table "organisation" rename column "email_domain" to "uem_ldap_ou";`);
    }

    override down(): void | Promise<void> {
        this.addSql(`alter table "organisation" rename column "uem_ldap_ou" to "email_domain";`);
    }
}
