#!/usr/bin/env node
// Export all persons with email (priority 0/1) to EFLK target LDIF.
// Standalone script, no dependency on the NestJS app bootstrap.
// Connection exclusively via SSH tunnel, all parameters are required (no fallback).
// Password/passphrase are prompted interactively and masked.
//
// Usage: see README.md in the same folder (--help for all options).

import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
import { buildContainerEntries, buildGroupEntry, buildPersonEntry, toPersonRecord } from './ldif-format.mjs';
import {
    queryOrganisationChildren,
    queryOrganisationParentChain,
    queryPersonsWithEmail,
    queryEmailsForPersons,
    queryLockedPersons,
    queryPersonOrganisationContexts,
    queryOrganisationsByIds,
} from './db-queries.mjs';
import { openSshTunnel, closeSshTunnel, promptHidden } from './ssh-tunnel.mjs';

const DEFAULT_LOCAL_PORT = 15432;
// see config/config.json
const DEFAULT_BASE_DN = 'dc=schule-sh,dc=de';
const DEFAULT_DB_PORT = 5432;

const REQUIRED_OPTIONS = [
    'out', 'rootOrganisationId', 'pgUser', 'pgDatabase',
    'sshHost', 'sshPort', 'sshUser', 'sshKey', 'dbHost',
];

function parseArgs(argv) {
    const args = {
        out: undefined,
        baseDn: DEFAULT_BASE_DN,
        rootOrganisationId: undefined,
        pgUser: undefined,
        pgDatabase: undefined,
        sshHost: undefined,
        sshPort: undefined,
        sshUser: undefined,
        sshKey: undefined,
        dbHost: undefined,
        dbPort: DEFAULT_DB_PORT,
        localPort: DEFAULT_LOCAL_PORT,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[++i];

        switch (arg) {
            case '--out':
                args.out = next();
                break;
            case '--base-dn':
                args.baseDn = next();
                break;
            case '--root-organisation-id':
                args.rootOrganisationId = next();
                break;
            case '--pg-user':
                args.pgUser = next();
                break;
            case '--pg-database':
                args.pgDatabase = next();
                break;
            case '--ssh-host':
                args.sshHost = next();
                break;
            case '--ssh-port':
                args.sshPort = Number.parseInt(next(), 10);
                break;
            case '--ssh-user':
                args.sshUser = next();
                break;
            case '--ssh-key':
                args.sshKey = next();
                break;
            case '--db-host':
                args.dbHost = next();
                break;
            case '--db-port':
                args.dbPort = Number.parseInt(next(), 10);
                break;
            case '--local-port':
                args.localPort = Number.parseInt(next(), 10);
                break;
            case '--help':
                printHelp();
                process.exit(0);
                break;
            default:
                throw new Error(`Unbekannte Option: ${arg} (siehe --help)`);
        }
    }
    const missing = REQUIRED_OPTIONS.filter((key) => args[key] === undefined || Number.isNaN(args[key]));
    if (missing.length > 0) {
        throw new Error(`Fehlende Pflicht-Optionen (kein Fallback): ${missing.join(', ')} (siehe --help)`);
    }

    return args;
}

function printHelp() {
    console.log(`Export aller Personen mit E-Mail nach EFLK-Ziel-LDIF

Alle Optionen sind Pflicht (kein Fallback/Default), ausser --local-port, --base-dn und --db-port:
  --out <datei>                   Ausgabedatei
  --base-dn <dn>                  Basis-DN (Default: ${DEFAULT_BASE_DN})
  --root-organisation-id <uuid>   ROOT_ORGANISATION_ID (siehe config/config.json)

  Postgres-Zugangsdaten:
  --pg-user <user>                 Postgres-Benutzer
  --pg-database <db>               Postgres-Datenbank

  SSH-Tunnel (verpflichtend, z.B. wie in pgAdmin ueber einen Jump-Host):
  --ssh-host <host>                 Jump-Host
  --ssh-port <port>                 SSH-Port des Jump-Hosts
  --ssh-user <user>                 SSH-Benutzer auf dem Jump-Host
  --ssh-key <pfad>                  Pfad zum privaten SSH-Key
  --db-host <host>                  Ziel-DB-Host aus Sicht des Jump-Hosts
  --db-port <port>                  Ziel-DB-Port aus Sicht des Jump-Hosts (Default: ${DEFAULT_DB_PORT})
  --local-port <port>               Rein lokaler Forward-Port, hat nichts mit dem Zielsystem zu tun (Default: ${DEFAULT_LOCAL_PORT})
  --help                            Diese Hilfe anzeigen

Das Postgres-Passwort und die SSH-Key-Passphrase werden immer interaktiv und
maskiert abgefragt (keine Uebergabe per Parameter/ENV-Variable).
`);
}

// Resolves the two direct root children ("Oeffentliche Schulen", "Ersatzschulen"),
// analogous to OrganisationRepository.findRootDirectChildren()
async function resolveRootChildren(client, rootOrganisationId) {
    const rows = await queryOrganisationChildren(client, rootOrganisationId);
    const oeffentlich = rows.find((r) => r.name?.includes('Öffentliche'));
    const ersatz = rows.find((r) => r.name?.includes('Ersatz'));

    // Can happen for a wrong --root-organisation-id.
    if (!oeffentlich || !ersatz) {
        throw new Error(
            `Konnte unter --root-organisation-id ${rootOrganisationId} nicht beide Kinder 'Oeffentliche Schulen' und 'Ersatzschulen' finden.`,
        );
    }

    return { oeffentlichId: oeffentlich.id, ersatzId: ersatz.id };
}

// Analogous to OrganisationRepository.findOrganisationZuordnungErsatzOderOeffentlich():
// walks the administriert_von chain of an organisation up and checks under which
// root child it hangs. Result is cached per organisation.
async function classifyOrganisation(client, organisationId, roots, cache) {
    if (cache.has(organisationId)) {
        return cache.get(organisationId);
    }

    const rows = await queryOrganisationParentChain(client, organisationId);
    const chainIds = new Set(rows.map((r) => r.id));
    const result = roots.ersatzId && chainIds.has(roots.ersatzId) ? 'ERSATZ' : 'OEFFENTLICH';
    cache.set(organisationId, result);

    return result;
}

// Persons with at least one priority 0/1 email address (status is irrelevant, see README.md).
async function fetchPersonsWithEmail(client) {
    const personRows = await queryPersonsWithEmail(client);

    if (personRows.length === 0) {
        return [];
    }

    const personIds = personRows.map((r) => r.id);
    const emailRows = await queryEmailsForPersons(client, personIds);
    const lockRows = await queryLockedPersons(client, personIds);
    const gesperrtePersonenIds = new Set(lockRows.map((r) => r.person_id));
    const kontextRows = await queryPersonOrganisationContexts(client, personIds);

    const emailsByPerson = new Map();
    for (const row of emailRows) {
        const list = emailsByPerson.get(row.person_id) ?? [];
        list.push(row);
        emailsByPerson.set(row.person_id, list);
    }

    const organisationIdsByPerson = new Map();
    for (const row of kontextRows) {
        const set = organisationIdsByPerson.get(row.person_id) ?? new Set();
        set.add(row.organisation_id);
        organisationIdsByPerson.set(row.person_id, set);
    }

    return personRows.map((p) => toPersonRecord(p, { gesperrtePersonenIds, emailsByPerson, organisationIdsByPerson }));
}

async function fetchOrganisationen(client, organisationIds) {
    if (organisationIds.length === 0) {
        return new Map();
    }

    const rows = await queryOrganisationsByIds(client, organisationIds);
    const organisationenById = new Map(rows.map((r) => [r.id, r]));

    return organisationenById;
}

function logEmailKontextDiagnostics(persons) {
    const personsWithoutEmailServiceProviderKontext = persons.filter((p) => p.organisationIds.length === 0).length;
    console.log(
        `${persons.length} Personen erfuellen 'hat E-Mail' (email.address, priority 0/1, unabhaengig vom Status); `
        + `davon ${personsWithoutEmailServiceProviderKontext} ohne Personenkontext mit E-Mail-Service-Provider.`,
    );
}

async function classifyAllOrganisations(client, organisationIds, roots) {
    const classificationCache = new Map();
    const entries = await Promise.all(organisationIds.map(async (organisationId) => {
        const classification = await classifyOrganisation(client, organisationId, roots, classificationCache);
        return [organisationId, classification === 'ERSATZ' ? 'ersatz' : 'oeffentlich'];
    }));

    return new Map(entries);
}

// Bucket of the person = bucket of the first assigned school (analogous to the "mainSchool" fallback per the target schema)
function assignPersonBuckets(persons, ouByOrganisation) {
    const ouByPerson = new Map();
    for (const person of persons) {
        const firstOrgId = person.organisationIds[0];
        ouByPerson.set(person.id, firstOrgId ? ouByOrganisation.get(firstOrgId) : 'oeffentlich');
    }

    return ouByPerson;
}

// Builds the LDIF lines for all person entries, keeping each person's DN around for group membership.
function buildPersonEntries(persons, ouByPerson, baseDn) {
    const personLines = [];
    const personDnById = new Map();
    for (const person of persons) {
        const ou = ouByPerson.get(person.id);
        const entry = buildPersonEntry(person, ou, baseDn);
        personDnById.set(person.id, entry.dn);
        personLines.push(...entry.lines, '');
    }

    return { personLines, personDnById };
}

function groupMembersByOrganisation(persons, personDnById) {
    const membersByOrganisation = new Map();
    for (const person of persons) {
        const personDn = personDnById.get(person.id);
        for (const organisationId of person.organisationIds) {
            const list = membersByOrganisation.get(organisationId) ?? [];
            list.push(personDn);
            membersByOrganisation.set(organisationId, list);
        }
    }

    return membersByOrganisation;
}

// Builds the LDIF lines for all group entries (one group per organisation).
function buildAllGroupEntries(organisationIds, ouByOrganisation, organisationen, membersByOrganisation, baseDn) {
    const lines = [];
    for (const organisationId of organisationIds) {
        const ou = ouByOrganisation.get(organisationId);
        const organisation = organisationen.get(organisationId);
        const memberDns = membersByOrganisation.get(organisationId) ?? [];
        lines.push(...buildGroupEntry(organisationId, organisation, ou, baseDn, memberDns), '');
    }

    return lines;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const sshTunnel = await openSshTunnel({
        sshHost: args.sshHost,
        sshPort: args.sshPort,
        sshUser: args.sshUser,
        sshKey: args.sshKey,
        dbHost: args.dbHost,
        dbPort: args.dbPort,
        localPort: args.localPort,
    });

    const clientConfig = {
        host: '127.0.0.1',
        port: args.localPort,
        user: args.pgUser,
        database: args.pgDatabase,
        password: await promptHidden('PGPASSWORD: '),
        connectionTimeoutMillis: 15000,
    };

    const client = new Client(clientConfig);

    try {
        console.log('Verbinde mit Postgres ueber den Tunnel...');
        await client.connect();
        console.log('Verbunden.');

        const roots = await resolveRootChildren(client, args.rootOrganisationId);
        const persons = await fetchPersonsWithEmail(client);

        logEmailKontextDiagnostics(persons);

        const allOrganisationIds = [...new Set(persons.flatMap((p) => p.organisationIds))];
        const organisationen = await fetchOrganisationen(client, allOrganisationIds);
        const ouByOrganisation = await classifyAllOrganisations(client, allOrganisationIds, roots);
        const ouByPerson = assignPersonBuckets(persons, ouByOrganisation);

        const { personLines, personDnById } = buildPersonEntries(persons, ouByPerson, args.baseDn);
        const membersByOrganisation = groupMembersByOrganisation(persons, personDnById);
        const groupLines = buildAllGroupEntries(allOrganisationIds, ouByOrganisation, organisationen, membersByOrganisation, args.baseDn);

        const outputLines = [...buildContainerEntries(args.baseDn), ...personLines, ...groupLines];

        await writeFile(args.out, outputLines.join('\n'));
        console.log(`${persons.length} Personen und ${allOrganisationIds.length} Gruppen exportiert nach ${args.out}`);
    } finally {
        // .end() can itself throw if .connect() never succeeded - don't let that hide the real error.
        await client.end().catch(() => {});
        await closeSshTunnel(sshTunnel);
    }
}

try {
    await main();
} catch (err) {
    console.error(err);
    process.exitCode = 1;
} finally {
    // The spawned ssh tunnel process (with its piped stdio) can keep the event loop
    // alive even after kill() - force-exit once our own cleanup has run.
    process.exit(process.exitCode ?? 0);
}
