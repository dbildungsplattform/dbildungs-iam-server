// Pure LDIF formatting helpers shared by export-eflk-ldif.mjs and validate-eflk-ldif.mjs.
// No DB/SSH/CLI dependencies - only string/data transformations.

// RFC 2849: values with non-ASCII characters or a forbidden leading character must be base64 encoded.
export function needsBase64(value) {
    if (value === '') return false;
    if (/^[ :<]/.test(value)) return true;

    return !/^[\x01-\x09\x0B\x0C\x0E-\x7F]*$/.test(value);
}

export function ldifLine(attribute, value) {
    if (needsBase64(value)) {
        return `${attribute}:: ${Buffer.from(value, 'utf8').toString('base64')}`;
    }

    return `${attribute}: ${value}`;
}

export function boolStr(value) {
    return value ? 'TRUE' : 'FALSE';
}

// |----------------------------------------|---------|
// | Prio 0: ACTIVE                         | false   |
// | Prio 0: PENDING                        | false   |
// | Prio 0: SUSPENDED                      | true    |
// | Prio 0: DEACTIVE                       | false   |
// | Prio 0: FAILED                         | false   |
// | Prio 0: TO_BE_DELETED                  | false   |
// | Prio 0: EXISTS_ONLY_IN_OX              | false   |
// | Kein Status vorhanden                  | false   |
// | Keine Prioritaet-0-Adresse             | false   |
// | Nur Prio 1: beliebiger Status          | false   |
function isDeaktiviertForThisScriptCase(primaryEmail) {
    return primaryEmail?.status === 'SUSPENDED';
}

// EFLK rule (see README.md): gesperrt = active user_lock entry for the person.
function isGesperrt(row, gesperrtePersonenIds) {
    return gesperrtePersonenIds.has(row.id);
}

function getEmails(row, emailsByPerson) {
    return (emailsByPerson.get(row.id) ?? []).sort((a, b) => a.priority - b.priority);
}

function getOrganisationIds(row, organisationIdsByPerson) {
    return [...(organisationIdsByPerson.get(row.id) ?? [])];
}

// Maps a raw person DB row plus pre-computed lookups to the target LDIF person record
// (deaktiviert/gesperrt derivation follows the EFLK rules documented in README.md).
export function toPersonRecord(row, { gesperrtePersonenIds, emailsByPerson, organisationIdsByPerson }) {
    const organisationIds = getOrganisationIds(row, organisationIdsByPerson);
    const emails = getEmails(row, emailsByPerson);
    const primaryEmail = emails.find((email) => email.priority === 0);

    return {
        id: row.id,
        username: row.username,
        vorname: row.vorname,
        familienname: row.familienname,
        deaktiviert: isDeaktiviertForThisScriptCase(primaryEmail),
        gesperrt: isGesperrt(row, gesperrtePersonenIds),
        emails,
        organisationIds,
    };
}

export function buildPersonEntry(person, ou, baseDn) {
    const dn = `uid=${person.id},cn=users,ou=${ou},${baseDn}`;
    const primary = person.emails.find((e) => e.priority === 0);
    const alternative = person.emails.find((e) => e.priority === 1);

    const lines = [
        ldifLine('dn', dn),
        'changetype: add',
        'objectClass: inetOrgPerson',
        'objectClass: spshUser',
        ldifLine('uid', person.id),
        ldifLine('cn', person.username ?? person.id),
        ldifLine('sn', person.familienname),
    ];

    if (person.vorname) {
        lines.push(ldifLine('givenName', person.vorname));
    }

    if (primary) {
        lines.push(ldifLine('mailPrimaryAddress', primary.address));
    }

    if (alternative) {
        lines.push(ldifLine('mailAlternativeAddress', alternative.address));
    }

    lines.push(
        ldifLine('deaktiviert', boolStr(person.deaktiviert)),
        ldifLine('gesperrt', boolStr(person.gesperrt)),
    );

    return { dn, lines };
}

export function buildGroupEntry(organisationId, organisation, ou, baseDn, memberDns) {
    const dn = `cn=${organisationId},cn=groups,ou=${ou},${baseDn}`;
    const lines = [
        ldifLine('dn', dn),
        'changetype: add',
        'objectClass: groupOfEntries',
        ldifLine('cn', organisationId),
    ];

    if (organisation?.kennung) {
        lines.push(
            ldifLine('description', `lehrer-${organisation.kennung}`),
            ldifLine('ou', organisation.kennung),
        );
    }

    if (organisation?.name) {
        lines.push(ldifLine('o', organisation.name));
    }

    for (const memberDn of memberDns) {
        lines.push(ldifLine('member', memberDn));
    }

    return lines;
}

export function buildContainerEntries(baseDn) {
    const lines = [];
    for (const ou of ['oeffentlich', 'ersatz']) {
        lines.push(
            ldifLine('dn', `ou=${ou},${baseDn}`),
            'changetype: add',
            'objectClass: organizationalUnit',
            ldifLine('ou', ou),
            '',
        );

        for (const cn of ['users', 'groups', 'lists']) {
            lines.push(
                ldifLine('dn', `cn=${cn},ou=${ou},${baseDn}`),
                'changetype: add',
                'objectClass: organizationalRole',
                ldifLine('cn', cn),
                '',
            );
        }
    }

    return lines;
}
