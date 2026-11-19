const QS_DOMAINS = {
    oeffentlich: 'qs.schule-sh.de',
    ersatz: 'qs.ersatzschule-sh.de',
};

const DOMAINS_BY_ENVIRONMENT = new Map([
    ['dev', QS_DOMAINS],
    ['stage', QS_DOMAINS],
    ['test', {
        oeffentlich: 'test.schule-sh.de',
        ersatz: 'test.ersatzschule-sh.de',
    }],
    ['prod', {
        oeffentlich: 'schule-sh.de',
        ersatz: 'ersatzschule-sh.de',
    }],
]);

const OU_BY_DOMAIN = new Map(
    [...DOMAINS_BY_ENVIRONMENT.values()].flatMap((domains) =>
        Object.entries(domains).map(([ou, domain]) => [domain, ou]),
    ),
);

export function getDomainsForEnvironment(environment) {
    const domains = DOMAINS_BY_ENVIRONMENT.get(environment);
    if (!domains) {
        throw new Error(`Unbekannte Umgebung '${environment}' (erwartet: dev, stage, test, prod)`);
    }

    return domains;
}

export function resolveOuFromEmailAddress(emailAddress) {
    const parts = emailAddress?.split('@') ?? [];
    if (parts.length !== 2 || !parts[0]) return undefined;

    return OU_BY_DOMAIN.get(parts[1].toLowerCase());
}
