import { Migration } from '@mikro-orm/migrations';

export class Migration20260930120000 extends Migration {
    override up(): void {
        for (const pilot of [1, 2, 3, 4, 5]) {
            this.addSql(`alter type "rollen_merkmal_enum" add value if not exists 'PILOT_${pilot}_ROLLE';`);
            this.addSql(`alter type "rollen_system_recht_enum" add value if not exists 'PILOT_${pilot}_ROLLEN_ZUORDNEN';`);
        }
    }
}
