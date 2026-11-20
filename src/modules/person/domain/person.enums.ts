export const PersonLockOccasionTypName: string = 'PersonLockOccasion';
export const SortFieldPersonTypName: string = 'SortFieldPerson';

export enum SortFieldPerson {
    FAMILIENNAME = 'familienname',
    VORNAME = 'vorname',
    PERSONALNUMMER = 'personalnummer',
    USERNAME = 'username',
}

export enum PersonLockOccasion {
    KOPERS_GESPERRT = 'KOPERS_GESPERRT',
    MANUELL_GESPERRT = 'MANUELL_GESPERRT',
}

export enum PersonExternalIdType {
    LDAP = 'LDAP',
}
