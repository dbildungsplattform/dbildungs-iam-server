import { Migration } from '@mikro-orm/migrations';

// Fixed id so the rollen assignment and the down-migration can reference the row deterministically.
const LK_ENDGERAETE_SERVICE_PROVIDER_ID: string = 'be044c68-46fe-4cd9-be0c-3c8a6bb926a7';

export class Migration20260904090100 extends Migration {
    public async up(): Promise<void> {
        // Create the "LK-Endgeräte" Angebot (UEM). It has target NONE: the backend returns it,
        // but the frontend must not render a tile for it. It is provided on the root organisation.
        this.addSql(
            `INSERT INTO service_provider (id, created_at, updated_at, name, target, url, kategorie, provided_on_schulstrukturknoten, external_system, requires2fa)
             SELECT '${LK_ENDGERAETE_SERVICE_PROVIDER_ID}', now(), now(), 'LK-Endgeräte', 'NONE', NULL, 'VERWALTUNG', o.id, 'UEM', false
             FROM organisation o
             WHERE o.typ = 'ROOT'
             ON CONFLICT (id) DO NOTHING;`,
        );

        // Assign the Angebot to every Rolle of Rollenart LEHR.
        this.addSql(
            `INSERT INTO rolle_service_provider (rolle_id, service_provider_id)
             SELECT r.id, '${LK_ENDGERAETE_SERVICE_PROVIDER_ID}'
             FROM rolle r
             WHERE r.rollenart = 'LEHR'
             ON CONFLICT (rolle_id, service_provider_id) DO NOTHING;`,
        );
    }

    public override async down(): Promise<void> {
        this.addSql(
            `DELETE FROM rolle_service_provider WHERE service_provider_id = '${LK_ENDGERAETE_SERVICE_PROVIDER_ID}';`,
        );
        this.addSql(`DELETE FROM service_provider WHERE id = '${LK_ENDGERAETE_SERVICE_PROVIDER_ID}';`);
    }
}
