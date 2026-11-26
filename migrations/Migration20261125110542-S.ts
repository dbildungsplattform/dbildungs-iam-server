import { Migration } from '@mikro-orm/migrations';

export class Migration20261125110542 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter index "service_provider_rollenarten_whitelist_service_provider_id_inde" rename to "sp_rollenarten_whitelist_sp_id_index";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter index "sp_rollenarten_whitelist_sp_id_index" rename to "service_provider_rollenarten_whitelist_service_provider_id_inde";`);
  }

}
