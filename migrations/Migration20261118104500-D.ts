import { Migration } from '@mikro-orm/migrations';

export class Migration20261118104500 extends Migration {
    public async up(): Promise<void> {
        this.addSql(
            `DELETE FROM SERVICE_PROVIDER_MERKMAL WHERE MERKMAL = 'NACHTRAEGLICH_ZUWEISBAR' AND SERVICE_PROVIDER_ID IN ( SELECT ID FROM SERVICE_PROVIDER WHERE EXTERNAL_SYSTEM = 'ITSLEARNING');`,
        );
    }

    public override async down(): Promise<void> {
        this.addSql(
            `INSERT INTO SERVICE_PROVIDER_MERKMAL SELECT ID, 'NACHTRAEGLICH_ZUWEISBAR' FROM SERVICE_PROVIDER WHERE EXTERNAL_SYSTEM = 'ITSLEARNING';`,
        );
    }
}
