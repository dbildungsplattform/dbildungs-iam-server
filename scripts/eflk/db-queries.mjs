// Thin Postgres query wrappers for export-eflk-ldif.mjs. Each function runs exactly
// one SQL statement and returns the raw rows - no mapping/caching/business logic.

export async function queryOrganisationChildren(client, administriertVonId) {
    const { rows } = await client.query(
        `SELECT id, name FROM public.organisation WHERE administriert_von = $1`,
        [administriertVonId],
    );

    return rows;
}

export async function queryOrganisationParentChain(client, organisationId) {
    const { rows } = await client.query(
        `WITH RECURSIVE parents AS (
             SELECT id, administriert_von FROM public.organisation WHERE id = $1
             UNION ALL
             SELECT o.id, o.administriert_von
             FROM public.organisation o
             JOIN parents p ON o.id = p.administriert_von
         )
         SELECT id FROM parents`,
        [organisationId],
    );

    return rows;
}

export async function queryPersonsWithEmail(client) {
    const { rows } = await client.query(
        `SELECT p.id, p.username, p.vorname, p.familienname, p.org_unassignment_date
         FROM public.person p
         WHERE EXISTS (
             SELECT 1
             FROM email.address a
             WHERE a.spsh_person_id = p.id::text
               AND a.priority IN (0, 1)
         )
         ORDER BY p.id`,
    );

    return rows;
}

export async function queryEmailsForPersons(client, personIds) {
    const { rows } = await client.query(
        `SELECT a.spsh_person_id AS person_id, a.address, a.priority
         FROM email.address a
         WHERE a.spsh_person_id = ANY($1::text[])
           AND a.priority IN (0, 1)
         ORDER BY a.spsh_person_id, a.priority`,
        [personIds],
    );

    return rows;
}

export async function queryLockedPersons(client, personIds) {
    const { rows } = await client.query(
        `SELECT person_id
         FROM public.user_lock
         WHERE person_id = ANY($1::uuid[])
           AND (locked_until IS NULL OR locked_until > now())`,
        [personIds],
    );

    return rows;
}

export async function queryPersonOrganisationContexts(client, personIds) {
    const { rows } = await client.query(
        `SELECT DISTINCT pk.person_id, pk.organisation_id
         FROM public.personenkontext pk
         JOIN public.rolle_service_provider rsp ON rsp.rolle_id = pk.rolle_id
         JOIN public.service_provider sp ON sp.id = rsp.service_provider_id AND sp.external_system = 'EMAIL'
         WHERE pk.person_id = ANY($1::uuid[])`,
        [personIds],
    );

    return rows;
}

export async function queryOrganisationsByIds(client, organisationIds) {
    const { rows } = await client.query(
        `SELECT id, name, kennung FROM public.organisation WHERE id = ANY($1::uuid[])`,
        [organisationIds],
    );

    return rows;
}
