import { Migration } from '@mikro-orm/migrations';

export class Migration20261103070039 extends Migration {
    up(): void {
        this.addSql('alter table "meldung" alter column "inhalt" type text using ("inhalt"::text);');
    }

    override down(): void {
        this.addSql('alter table "meldung" alter column "inhalt" type varchar(2000);');
    }
}
