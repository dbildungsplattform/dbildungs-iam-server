import { Migration } from '@mikro-orm/migrations';

export class Migration20260819200521 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create index "service_provider_name_trgm_index" on "public"."service_provider" using gin ("name" gin_trgm_ops);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "service_provider_name_trgm_index";`);
  }

}
