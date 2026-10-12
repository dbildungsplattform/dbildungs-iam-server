import { Migration } from '@mikro-orm/migrations';

export class Migration20260930120115 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "organisation" alter column "name" set not null;`);
    this.addSql(`alter table "organisation" alter column "typ" set not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "organisation" alter column "name" drop not null;`);
    this.addSql(`alter table "organisation" alter column "typ" drop not null;`);
  }

}
