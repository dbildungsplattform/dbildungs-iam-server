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

// EFLK rule (see README.md): deaktiviert = person no longer has a school assignment.
function isDeaktiviert(row) {
    return row.org_unassignment_date !== null;
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
    return {
        id: row.id,
        username: row.username,
        vorname: row.vorname,
        familienname: row.familienname,
        deaktiviert: isDeaktiviert(row),
        gesperrt: isGesperrt(row, gesperrtePersonenIds),
        emails: getEmails(row, emailsByPerson),
        organisationIds: getOrganisationIds(row, organisationIdsByPerson),
    };
}

export function buildPersonEntry(person, ou, baseDn) {
    const dn = `uid=${person.id},cn=users,ou=${ou},${baseDn}`;
    const primary = person.emails.find((e) => e.priority === 0);
    const alternatives = person.emails.filter((e) => e.priority > 0);

    const lines = [
        ldifLine('dn', dn),
        'changetype: add',
        'objectClass: top',
        'objectClass: inetOrgPerson',
        // TODO: exact name of the schulportalsh.schema objectClass not final yet (Epic SPSH-4216)
        'objectClass: schulportalSHPerson',
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

    for (const alt of alternatives) {
        lines.push(ldifLine('mailAlternativeAddress', alt.address));
    }

    lines.push(ldifLine('deaktiviert', boolStr(person.deaktiviert)));
    lines.push(ldifLine('gesperrt', boolStr(person.gesperrt)));

    return { dn, lines };
}

export function buildGroupEntry(organisationId, organisation, ou, baseDn, memberDns) {
    const dn = `cn=${organisationId},cn=groups,ou=${ou},${baseDn}`;
    const lines = [
        ldifLine('dn', dn),
        'changetype: add',
        'objectClass: top',
        'objectClass: groupOfNames',
        ldifLine('cn', organisationId),
    ];

    if (organisation?.kennung) {
        lines.push(ldifLine('description', `Lehrer - ${organisation.kennung}`));
        lines.push(ldifLine('ou', organisation.kennung));
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
            'objectClass: top',
            'objectClass: organizationalUnit',
            ldifLine('ou', ou),
            '',
        );

        for (const cn of ['users', 'groups', 'lists']) {
            lines.push(
                ldifLine('dn', `cn=${cn},ou=${ou},${baseDn}`),
                'changetype: add',
                'objectClass: top',
                'objectClass: organizationalRole',
                ldifLine('cn', cn),
                '',
            );
        }
    }

    return lines;
}
