import { Migration } from '@mikro-orm/migrations';

export class Migration20261009113548 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter type "organisations_typ_enum" add value if not exists 'BEHOERDE' after 'TRAEGER';`);

    this.addSql(`alter type "rollen_system_recht_enum" add value if not exists 'BEHOERDEN_VERWALTEN' after 'KLASSEN_VERWALTEN';`);
  }

}
