const OU_BY_DOMAIN = new Map([
    ['schule-sh.de', 'oeffentlich'],
    ['ersatzschule-sh.de', 'ersatz'],
    ['qs.schule-sh.de', 'oeffentlich'],
    ['qs.ersatzschule-sh.de', 'ersatz'],
    ['test.schule-sh.de', 'oeffentlich'],
    ['test.ersatzschule-sh.de', 'ersatz'],
]);

export function resolveOuFromEmailAddress(emailAddress) {
    const parts = emailAddress?.split('@') ?? [];
    if (parts.length !== 2 || !parts[0]) return undefined;

    return OU_BY_DOMAIN.get(parts[1].toLowerCase());
}
