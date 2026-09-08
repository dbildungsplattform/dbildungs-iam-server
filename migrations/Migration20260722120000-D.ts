import { Migration } from '@mikro-orm/migrations';

export class Migration20260722120000 extends Migration {
    public async up(): Promise<void> {
        this.addSql(`
            INSERT INTO
                SERVICE_PROVIDER_MERKMAL (SERVICE_PROVIDER_ID, MERKMAL)
            SELECT
                SPM.SERVICE_PROVIDER_ID,
                MERKMAL.MERKMAL
            FROM
                SERVICE_PROVIDER_MERKMAL SPM
                CROSS JOIN (
                    VALUES
                        (
                            'ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG'::SERVICE_PROVIDER_MERKMAL_ENUM
                        ),
                        (
                            'ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG'::SERVICE_PROVIDER_MERKMAL_ENUM
                        )
                ) AS MERKMAL (MERKMAL)
            WHERE
                SPM.MERKMAL = 'VERFUEGBAR_FUER_ROLLENERWEITERUNG'
            ON CONFLICT (SERVICE_PROVIDER_ID, MERKMAL) DO NOTHING;
        `);
    }

    public override async down(): Promise<void> {
        this.addSql(
            `delete from service_provider_merkmal where merkmal = 'ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG' or merkmal = 'ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG'`,
        );
    }
}
