import { Migration } from '@mikro-orm/migrations';

export class Migration20260707174637 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter type "rollen_merkmal_enum" add value if not exists 'MPT_ROLLE' after 'KOPERS_PFLICHT';`);
  }

}
