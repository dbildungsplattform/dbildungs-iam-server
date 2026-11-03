import { Migration } from '@mikro-orm/migrations';

export class Migration20261103070039 extends Migration {
    async up(): Promise<void> {
        this.addSql('alter table "meldung" alter column "inhalt" type text using ("inhalt"::text);');
    }

    override async down(): Promise<void> {
        this.addSql('alter table "meldung" alter column "inhalt" type varchar(2000) using ("inhalt"::varchar(2000));');
    }
}
