import { OrganisationsTyp } from '../domain/organisation.enums.js';

/**
 * Organisations of an itslearning-enabled school plus their classes (KLASSE), following administriert_von.
 * Only KLASSE children are traversed, so sub-schools below a school are not included.
 * Offen: Sollen Unterschulen (SCHULE unter SCHULE) einbezogen werden? Dann müsste die Bedingung im rekursiven Teil angepasst werden.
 * Offen: Ist itslearning-Freischaltung an Unterschulen eine bewusste Entscheidung wenn überhaupt möglich?
 */
export const ITSLEARNING_ORGANISATION_SUBTREE_SQL: string = `
    WITH RECURSIVE itslearning_subtree AS (
        SELECT o.id FROM public.organisation o WHERE o.itslearning_enabled = true
        UNION
        SELECT c.id FROM public.organisation c INNER JOIN itslearning_subtree s ON c.administriert_von = s.id
        WHERE c.typ = '${OrganisationsTyp.KLASSE}'
    )
    SELECT id FROM itslearning_subtree
`;
