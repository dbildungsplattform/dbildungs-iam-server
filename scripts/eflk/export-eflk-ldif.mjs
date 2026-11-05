#!/usr/bin/env node
// Export all persons with email (priority 0/1) to EFLK target LDIF.
// Standalone script, no dependency on the NestJS app bootstrap.
// Starts a kubectl port-forward for the selected environment. The DB password
// is prompted interactively and masked.
//
// Usage: see README.md in the same folder (--help for all options).

import { Client } from 'pg';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { closeKubectlPortForward, openKubectlPortForward } from './kubectl-port-forward.mjs';
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
import { promptHidden } from './ssh-tunnel.mjs';
import { resolveOuFromEmailAddress } from './email-domains.mjs';

// see config/config.json
const DEFAULT_BASE_DN = 'dc=schule-sh,dc=de';
const DEFAULT_LOCAL_PORT = 5433;
const DEFAULT_KUBECONFIG_DIR = join(homedir(), '.kube');
const REQUIRED_OPTIONS = ['out', 'rootOrganisationId', 'pgUser', 'pgDatabase', 'environment'];

function parseArgs(argv) {
    const args = {
        out: undefined,
        baseDn: DEFAULT_BASE_DN,
        rootOrganisationId: undefined,
        pgUser: undefined,
        pgDatabase: undefined,
        environment: undefined,
        kubeconfigDir: DEFAULT_KUBECONFIG_DIR,
        localPort: DEFAULT_LOCAL_PORT,
        includeContainers: false,
        excludeSchools: false,
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
            case '--environment':
                args.environment = next();
                break;
            case '--kubeconfig-dir':
                args.kubeconfigDir = next();
                break;
            case '--local-port':
                args.localPort = Number.parseInt(next(), 10);
                break;
            case '--include-containers':
                args.includeContainers = true;
                break;
            case '--exclude-schools':
                args.excludeSchools = true;
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
    if (!['dev', 'stage', 'prod'].includes(args.environment)) {
        throw new Error(`Ungueltige Umgebung '${args.environment}'. Erlaubt sind: dev, stage, prod.`);
    }
    if (!Number.isInteger(args.localPort) || args.localPort < 1 || args.localPort > 65535) {
        throw new Error('--local-port muss eine Portnummer zwischen 1 und 65535 sein.');
    }
    if (!args.kubeconfigDir) {
        throw new Error('--kubeconfig-dir darf nicht leer sein.');
    }

    return args;
}

function printHelp() {
    console.log(`Export aller Personen mit E-Mail nach EFLK-Ziel-LDIF

Alle Optionen sind Pflicht (kein Fallback/Default), ausser --base-dn, --kubeconfig-dir, --local-port, --include-containers und --exclude-schools:
  --out <datei>                   Ausgabedatei
  --base-dn <dn>                  Basis-DN (Default: ${DEFAULT_BASE_DN})
  --root-organisation-id <uuid>   ROOT_ORGANISATION_ID (siehe config/config.json)
  --environment <dev|stage|prod>  Kubernetes-Umgebung fuer den Port-Forward
  --kubeconfig-dir <pfad>         Verzeichnis der Cluster-Konfigurationen (Default: ~/.kube)
  --local-port <port>             Lokaler Port des Forwards (Default: ${DEFAULT_LOCAL_PORT})
  --include-containers            OU-/users-/groups-/lists-Container mit exportieren (Default: ohne Container)
  --exclude-schools               Schul-/Gruppen-Eintraege nicht exportieren (Default: exportieren)

  Postgres-Zugangsdaten:
  --pg-user <user>                 Postgres-Benutzer
  --pg-database <db>               Postgres-Datenbank

  kubectl startet automatisch einen Port-Forward zu svc/socat-tunneller-pg
  im Namespace spsh-service. Der Zielport in Kubernetes ist 5432.
  --help                            Diese Hilfe anzeigen

Das Postgres-Passwort wird immer interaktiv und maskiert abgefragt.
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

function resolvePersonBucketFromEmail(person) {
    const email = person.emails.find((entry) => entry.priority === 0)
        ?? person.emails.find((entry) => entry.priority === 1);
    const ou = resolveOuFromEmailAddress(email?.address);

    if (!ou) {
        console.error(
            `Person ${person.id} ohne Schulzuordnung: Keine gueltige OU aus E-Mail '${email?.address ?? 'nicht vorhanden'}' ableitbar. Person wird nicht exportiert.`,
            { personId: person.id, username: person.username, emails: person.emails },
        );
    }

    return ou;
}

// Bucket of the person = bucket of the first assigned school (analogous to the "mainSchool" fallback per the target schema)
function assignPersonBuckets(persons, ouByOrganisation) {
    const ouByPerson = new Map();
    for (const person of persons) {
        const firstOrgId = person.organisationIds[0];
        ouByPerson.set(person.id, firstOrgId ? ouByOrganisation.get(firstOrgId) : resolvePersonBucketFromEmail(person));
    }

    return ouByPerson;
}

// Builds the LDIF lines for all person entries, keeping each person's DN around for group membership.
function buildPersonEntries(persons, ouByPerson, baseDn) {
    const personLines = [];
    const personDnById = new Map();
    for (const person of persons) {
        const ou = ouByPerson.get(person.id);
        if (!ou) {
            continue;
        }
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
        if (!personDn) {
            continue;
        }
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

    let portForward;
    let client;
    try {
        portForward = await openKubectlPortForward({
            environment: args.environment,
            kubeconfigDir: args.kubeconfigDir,
            localPort: args.localPort,
        });
        client = new Client({
            host: '127.0.0.1',
            port: args.localPort,
            user: args.pgUser,
            database: args.pgDatabase,
            password: await promptHidden('PGPASSWORD: '),
            connectionTimeoutMillis: 15000,
        });

        console.log(`Verbinde mit Postgres ueber den Port-Forward (127.0.0.1:${args.localPort})...`);
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
        const groupLines = args.excludeSchools
            ? []
            : buildAllGroupEntries(allOrganisationIds, ouByOrganisation, organisationen, membersByOrganisation, args.baseDn);

        const containerLines = args.includeContainers ? buildContainerEntries(args.baseDn) : [];
        const outputLines = [...containerLines, ...personLines, ...groupLines];
        const groupCount = args.excludeSchools ? 0 : allOrganisationIds.length;

        await writeFile(args.out, outputLines.join('\n'));
        console.log(`${personDnById.size} Personen und ${groupCount} Gruppen exportiert nach ${args.out}`);
    } finally {
        // .end() can itself throw if .connect() never succeeded - don't let that hide the real error.
        if (client) await client.end().catch(() => {});
        await closeKubectlPortForward(portForward);
    }
}

try {
    await main();
} catch (err) {
    console.error(err);
    process.exitCode = 1;
}
