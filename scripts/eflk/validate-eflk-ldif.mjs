#!/usr/bin/env node
// for invalid data constellations and writes a report to a file.
// Standalone, no dependency on the DB/export script - works exclusively on
// the finished .ldif file.
//
// Usage: see README.md in the same folder (--help for all options).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, basename, extname, join } from 'node:path';
import { needsBase64 } from './ldif-format.mjs';

function parseArgs(argv) {
    const args = { file: undefined };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[++i];
        switch (arg) {
            case '--file':
                args.file = next();
                break;
            case '--help':
                printHelp();
                process.exit(0);
                break;
            default:
                throw new Error(`Unbekannte Option: ${arg} (siehe --help)`);
        }
    }

    if (!args.file) {
        throw new Error('Fehlende Pflicht-Option: --file (siehe --help)');
    }

    return args;
}

// Report is written next to the input file as '<name-without-ext>-report.txt'.
function reportPathFor(inPath) {
    const ext = extname(inPath);
    const nameWithoutExt = basename(inPath, ext);

    return join(dirname(inPath), `${nameWithoutExt}-report.txt`);
}

function printHelp() {
    console.log(`Validiert ein EFLK-Ziel-LDIF auf invalide Datenkonstellationen

  --file <datei>  Zu pruefende LDIF-Datei (z.B. Ausgabe von export-eflk-ldif.mjs)
                  Report wird automatisch nach '<datei ohne Endung>-report.txt' geschrieben
  --help          Diese Hilfe anzeigen

Der Report enthaelt ERROR (eindeutig invalide, z.B. doppelte uid/DN, fehlende
Pflichtfelder, verwaiste Gruppenmitglieder) und WARN (auffaellig, aber nicht
zwingend falsch, z.B. Person ohne Schulzuordnung). Exit-Code ist 1, sobald
mindestens ein ERROR gefunden wurde, sonst 0 (fuer CI-Nutzung).
`);
}

// Unfolds continuation lines (RFC 2849: a follow-up line starts with exactly one space)
// into logical lines and skips comments ('#').
function foldLogicalLines(raw) {
    const physicalLines = raw.split(/\r\n|\n/);
    const logical = [];

    for (let i = 0; i < physicalLines.length; i += 1) {
        const line = physicalLines[i];
        if (line.startsWith('#')) continue;
        if (line.startsWith(' ') && logical.length > 0) {
            logical[logical.length - 1].text += line.slice(1);
            continue;
        }
        logical.push({ text: line, lineNumber: i + 1 });
    }

    return logical;
}

// Splits an attribute line into name/value, decoding base64 ('attr:: ...') if present.
function parseAttributeLine(logicalLine) {
    const { text } = logicalLine;
    const colonIndex = text.indexOf(':');

    if (colonIndex === -1) {
        return null;
    }

    const attr = text.slice(0, colonIndex);
    let rest = text.slice(colonIndex + 1);
    let isBase64 = false;
    if (rest.startsWith(':')) {
        isBase64 = true;
        rest = rest.slice(1);
    } else if (rest.startsWith('<')) {
        // URL references (":<") are not supported/expected here.
        return { attr, value: rest.trim(), isBase64: false, isUrl: true };
    }
    rest = rest.startsWith(' ') ? rest.slice(1) : rest;

    if (!isBase64) {
        return { attr, value: rest, isBase64: false };
    }

    try {
        return { attr, value: Buffer.from(rest, 'base64').toString('utf8'), isBase64: true, rawBase64: rest };
    } catch {
        return { attr, value: undefined, isBase64: true, rawBase64: rest, decodeError: true };
    }
}

// Groups logical lines (separated by blank lines) into records with dn + attribute map.
function buildRecords(logicalLines) {
    const records = [];
    let current = null;

    const flush = () => {
        if (current && current.attrs.size > 0) {
            records.push(current);
        }
        current = null;
    };

    for (const logicalLine of logicalLines) {
        if (logicalLine.text === '') {
            flush();
            continue;
        }
        const parsed = parseAttributeLine(logicalLine);
        if (!parsed) continue;
        if (parsed.attr === 'version') continue;

        if (!current) {
            current = { startLine: logicalLine.lineNumber, dn: undefined, attrs: new Map() };
        }
        if (parsed.attr === 'dn') {
            current.dn = parsed.value;
            current.dnLine = logicalLine.lineNumber;
        }

        const entry = { ...parsed, lineNumber: logicalLine.lineNumber };
        const list = current.attrs.get(parsed.attr) ?? [];
        list.push(entry);
        current.attrs.set(parsed.attr, list);
    }
    flush();

    return records;
}

function getValues(record, attr) {
    return (record.attrs.get(attr) ?? []).map((e) => e.value);
}

function getFirstValue(record, attr) {
    return getValues(record, attr)[0];
}

function classifyRecord(record) {
    const objectClasses = getValues(record, 'objectClass');
    if (objectClasses.includes('inetOrgPerson')) return 'person';
    if (objectClasses.includes('groupOfNames')) return 'group';
    if (objectClasses.includes('organizationalUnit') || objectClasses.includes('organizationalRole')) return 'container';

    return 'unknown';
}

// Expected DN pattern for persons: uid=<uid>,cn=users,ou=<oeffentlich|ersatz>,<baseDn...>
function parsePersonDn(dn) {
    const parts = dn.split(',').map((p) => p.trim());
    const [uidPart, cnPart, ouPart] = parts;
    const uidMatch = /^uid=(.+)$/.exec(uidPart ?? '');
    const cnMatch = /^cn=(.+)$/.exec(cnPart ?? '');
    const ouMatch = /^ou=(oeffentlich|ersatz)$/.exec(ouPart ?? '');

    return {
        uid: uidMatch?.[1],
        cnContainer: cnMatch?.[1],
        ou: ouMatch?.[1],
        baseDn: parts.slice(3).join(','),
    };
}

function parseGroupDn(dn) {
    const parts = dn.split(',').map((p) => p.trim());
    const [cnPart, cnContainerPart, ouPart] = parts;
    const cnMatch = /^cn=(.+)$/.exec(cnPart ?? '');
    const cnContainerMatch = /^cn=(.+)$/.exec(cnContainerPart ?? '');
    const ouMatch = /^ou=(oeffentlich|ersatz)$/.exec(ouPart ?? '');

    return {
        cn: cnMatch?.[1],
        cnContainer: cnContainerMatch?.[1],
        ou: ouMatch?.[1],
    };
}

const MAIL_DOMAIN_BY_OU = {
    oeffentlich: 'schule-sh.de',
    ersatz: 'ersatzschule-sh.de',
};

// Collects issues without every caller having to thread the array through by hand.
function createIssueCollector() {
    const issues = [];
    const add = (severity, dn, line, message) => issues.push({ severity, dn, line, message });

    return { issues, add };
}

// Common "get-array-or-create, push, set" pattern used by all uniqueness checks below.
function addToMultimap(map, key, value) {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
}

function validateChangetype(record, addIssue) {
    if (getValues(record, 'changetype').length === 0) {
        addIssue('WARN', record.dn, record.startLine, "Attribut 'changetype' fehlt");
    }
}

// Encoding sanity: check every non-base64 encoded line for whether it should have been.
function validateEncoding(record, addIssue) {
    for (const [attr, list] of record.attrs) {
        for (const entry of list) {
            if (entry.isUrl) continue;
            if (entry.isBase64 && entry.decodeError) {
                addIssue('ERROR', record.dn, entry.lineNumber, `Attribut '${attr}': ungueltige base64-Kodierung`);
                continue;
            }
            if (!entry.isBase64 && needsBase64(entry.value)) {
                addIssue(
                    'ERROR',
                    record.dn,
                    entry.lineNumber,
                    `Attribut '${attr}': Wert benoetigt laut RFC 2849 base64-Kodierung, ist aber als Klartext geschrieben`,
                );
            } else if (entry.isBase64 && entry.value !== undefined && !needsBase64(entry.value)) {
                addIssue(
                    'WARN',
                    record.dn,
                    entry.lineNumber,
                    `Attribut '${attr}': unnoetig base64-kodiert (Wert waere auch als Klartext gueltig)`,
                );
            }
        }
    }
}

function validateBooleanAttributes(record, addIssue) {
    for (const boolAttr of ['gesperrt', 'deaktiviert']) {
        const values = getValues(record, boolAttr);
        if (values.length > 0 && !['TRUE', 'FALSE'].includes(values[0])) {
            addIssue(
                'ERROR',
                record.dn,
                record.startLine,
                `Attribut '${boolAttr}' hat ungueltigen Wert '${values[0]}' (erwartet: TRUE/FALSE)`,
            );
        } else if (values.length === 0) {
            addIssue('WARN', record.dn, record.startLine, `Attribut '${boolAttr}' fehlt`);
        }
    }
}

function collectMailAddresses(record) {
    const primary = getFirstValue(record, 'mailPrimaryAddress');
    const alternatives = getValues(record, 'mailAlternativeAddress');

    const allMails = [
        ...(primary ? [{ value: primary, attr: 'mailPrimaryAddress' }] : []),
        ...alternatives.map((value) => ({ value, attr: 'mailAlternativeAddress' })),
    ];

    return allMails;
}

function validateMailDomain(record, ou, allMails, addIssue) {
    if (!ou || !MAIL_DOMAIN_BY_OU[ou]) return;

    const expectedDomain = MAIL_DOMAIN_BY_OU[ou];
    const otherDomain = ou === 'oeffentlich' ? MAIL_DOMAIN_BY_OU.ersatz : MAIL_DOMAIN_BY_OU.oeffentlich;
    for (const { value, attr } of allMails) {
        if (value.toLowerCase().endsWith(`@${otherDomain}`)) {
            addIssue(
                'ERROR',
                record.dn,
                record.startLine,
                `Attribut '${attr}' ('${value}') passt nicht zu ou=${ou} (erwartete Domain: ${expectedDomain})`,
            );
        }
    }
}

function validatePerson(record, { uidSeen, mailSeen, personDnSet, personEntries }, addIssue) {
    personDnSet.add(record.dn);
    personEntries.push(record);

    for (const requiredAttr of ['uid', 'cn', 'sn', 'mailPrimaryAddress']) {
        if (getValues(record, requiredAttr).length === 0) {
            addIssue('ERROR', record.dn, record.startLine, `Pflichtfeld '${requiredAttr}' fehlt`);
        }
    }

    const uid = getFirstValue(record, 'uid');
    if (uid) {
        addToMultimap(uidSeen, uid, record.dn);
    }

    const { uid: dnUid, cnContainer, ou } = parsePersonDn(record.dn);
    if (!dnUid || cnContainer !== 'users' || !ou) {
        addIssue(
            'ERROR',
            record.dn,
            record.startLine,
            "dn entspricht nicht dem erwarteten Muster 'uid=<uid>,cn=users,ou=oeffentlich|ersatz,<baseDn>'",
        );
    } else if (uid && dnUid !== uid) {
        addIssue('ERROR', record.dn, record.startLine, `uid im dn ('${dnUid}') weicht vom Attribut uid ('${uid}') ab`);
    }

    validateBooleanAttributes(record, addIssue);

    const allMails = collectMailAddresses(record);
    for (const { value, attr } of allMails) {
        addToMultimap(mailSeen, value.toLowerCase(), { dn: record.dn, attr });
    }

    validateMailDomain(record, ou, allMails, addIssue);
}

function validateGroup(record, { groupCnSeen, groupEntries }, addIssue) {
    groupEntries.push(record);

    if (getValues(record, 'cn').length === 0) {
        addIssue('ERROR', record.dn, record.startLine, "Pflichtfeld 'cn' fehlt");
    }
    const cn = getFirstValue(record, 'cn');
    if (cn) {
        addToMultimap(groupCnSeen, cn, record.dn);
    }

    const { cn: dnCn, cnContainer, ou } = parseGroupDn(record.dn);
    if (!dnCn || cnContainer !== 'groups' || !ou) {
        addIssue(
            'ERROR',
            record.dn,
            record.startLine,
            "dn entspricht nicht dem erwarteten Muster 'cn=<cn>,cn=groups,ou=oeffentlich|ersatz,<baseDn>'",
        );
    }

    const members = getValues(record, 'member');
    if (members.length === 0) {
        addIssue('WARN', record.dn, record.startLine, 'Gruppe hat keine Mitglieder (member)');
    }
    for (const memberDn of members) {
        const memberOu = parsePersonDn(memberDn).ou;
        if (memberOu && ou && memberOu !== ou) {
            addIssue(
                'ERROR',
                record.dn,
                record.startLine,
                `member '${memberDn}' liegt in ou=${memberOu}, Gruppe selbst aber in ou=${ou}`,
            );
        }
    }
}

function reportDuplicateDns(dnSeen, addIssue) {
    for (const [dn, lines] of dnSeen) {
        if (lines.length > 1) {
            addIssue('ERROR', dn, lines[0], `dn ist nicht eindeutig (${lines.length}x, Zeilen: ${lines.join(', ')})`);
        }
    }
}

function reportDuplicateUids(uidSeen, addIssue) {
    for (const [uid, dns] of uidSeen) {
        if (dns.length > 1) {
            addIssue('ERROR', dns[0], undefined, `uid '${uid}' ist nicht eindeutig, verwendet in: ${dns.join(' | ')}`);
        }
    }
}

function reportDuplicateGroupCns(groupCnSeen, addIssue) {
    for (const [cn, dns] of groupCnSeen) {
        if (dns.length > 1) {
            addIssue('ERROR', dns[0], undefined, `Gruppen-cn '${cn}' ist nicht eindeutig, verwendet in: ${dns.join(' | ')}`);
        }
    }
}

function reportDuplicateMails(mailSeen, addIssue) {
    for (const [mail, entries] of mailSeen) {
        if (entries.length > 1) {
            const detail = entries.map((e) => `${e.dn} (${e.attr})`).join(' | ');
            addIssue('ERROR', entries[0].dn, undefined, `E-Mailadresse '${mail}' ist nicht eindeutig: ${detail}`);
        }
    }
}

// Member DN does not point to an existing person.
function reportOrphanedMemberships(groupEntries, personDnSet, addIssue) {
    for (const group of groupEntries) {
        for (const memberDn of getValues(group, 'member')) {
            if (!personDnSet.has(memberDn)) {
                addIssue(
                    'ERROR',
                    group.dn,
                    group.startLine,
                    `member '${memberDn}' verweist auf keine existierende Person im Export`,
                );
            }
        }
    }
}

// Persons without any school assignment (no memberOf via any group).
function reportPersonsWithoutGroup(personEntries, groupEntries, addIssue) {
    const membersOfAnyGroup = new Set(groupEntries.flatMap((g) => getValues(g, 'member')));
    for (const person of personEntries) {
        if (!membersOfAnyGroup.has(person.dn)) {
            addIssue('WARN', person.dn, person.startLine, 'Person ist in keiner Schul-Gruppe (member) enthalten');
        }
    }
}

function validate(records) {
    const stats = { total: records.length, person: 0, group: 0, container: 0, unknown: 0 };
    const { issues, add: addIssue } = createIssueCollector();

    const dnSeen = new Map(); // dn -> [startLine,...]
    const uidSeen = new Map(); // uid -> [dn,...]
    const mailSeen = new Map(); // lowercase mail -> [{dn, attr}]
    const groupCnSeen = new Map(); // cn -> [dn,...]

    const personDnSet = new Set();
    const personEntries = [];
    const groupEntries = [];

    for (const record of records) {
        const kind = classifyRecord(record);
        stats[kind] += 1;

        if (!record.dn) {
            addIssue('ERROR', undefined, record.startLine, 'Record ohne dn-Zeile');
            continue;
        }

        addToMultimap(dnSeen, record.dn, record.startLine);
        validateChangetype(record, addIssue);
        validateEncoding(record, addIssue);

        if (kind === 'person') {
            validatePerson(record, { uidSeen, mailSeen, personDnSet, personEntries }, addIssue);
        } else if (kind === 'group') {
            validateGroup(record, { groupCnSeen, groupEntries }, addIssue);
        }
    }

    reportDuplicateDns(dnSeen, addIssue);
    reportDuplicateUids(uidSeen, addIssue);
    reportDuplicateGroupCns(groupCnSeen, addIssue);
    reportDuplicateMails(mailSeen, addIssue);
    reportOrphanedMemberships(groupEntries, personDnSet, addIssue);
    reportPersonsWithoutGroup(personEntries, groupEntries, addIssue);

    return { issues, stats };
}

function partitionBySeverity(issues) {
    return {
        errors: issues.filter((i) => i.severity === 'ERROR'),
        warnings: issues.filter((i) => i.severity === 'WARN'),
    };
}

function formatReport({ issues, stats }, inFile) {
    const { errors, warnings } = partitionBySeverity(issues);

    const lines = [];
    lines.push('EFLK LDIF Validation Report');
    lines.push(`Eingabedatei: ${inFile}`);
    lines.push(`Erzeugt am: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('Zusammenfassung:');
    lines.push(`  Eintraege gesamt: ${stats.total}`);
    lines.push(`  Personen: ${stats.person}`);
    lines.push(`  Gruppen: ${stats.group}`);
    lines.push(`  Container (OU/Rollen): ${stats.container}`);
    if (stats.unknown > 0) lines.push(`  Unbekannte Eintraege: ${stats.unknown}`);
    lines.push(`  Fehler (ERROR): ${errors.length}`);
    lines.push(`  Warnungen (WARN): ${warnings.length}`);
    lines.push('');

    const renderIssue = (issue) => {
        const location = issue.line ? `Zeile ${issue.line}` : 'Zeile unbekannt';
        const dn = issue.dn ?? '(kein dn)';
        return `[${location}] dn=${dn}\n  ${issue.message}`;
    };

    lines.push('=== ERROR ===');
    lines.push(...(errors.length > 0 ? errors.map(renderIssue) : ['(keine)']));
    lines.push('');
    lines.push('=== WARN ===');
    lines.push(...(warnings.length > 0 ? warnings.map(renderIssue) : ['(keine)']));
    lines.push('');

    return lines.join('\n');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const outPath = reportPathFor(args.file);

    const raw = await readFile(args.file, 'utf8');
    const logicalLines = foldLogicalLines(raw);
    const records = buildRecords(logicalLines);
    const result = validate(records);

    await writeFile(outPath, formatReport(result, args.file));

    const { errors, warnings } = partitionBySeverity(result.issues);
    console.log(`${records.length} Eintraege geprueft: ${errors.length} Fehler, ${warnings.length} Warnungen. Report: ${outPath}`);

    process.exitCode = errors.length > 0 ? 1 : 0;
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
