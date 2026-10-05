export const ServiceProviderKategorieTypName: string = 'ServiceProviderKategorie';
export const ServiceProviderTargetTypName: string = 'ServiceProviderTarget';
export const ServiceProviderMerkmalTypName: string = 'ServiceProviderMerkmal';
export const ServiceProviderSystemTypName: string = 'ServiceProviderSystem';

export enum ServiceProviderKategorie {
    EMAIL = 'EMAIL',
    UNTERRICHT = 'UNTERRICHT',
    VERWALTUNG = 'VERWALTUNG',
    SCHULISCH = 'SCHULISCH',
    HINWEISE = 'HINWEISE',
}

export enum ServiceProviderTarget {
    NONE = 'NONE',
    URL = 'URL',
    EMAIL = 'EMAIL',
    SCHULPORTAL_ADMINISTRATION = 'SCHULPORTAL_ADMINISTRATION',
}

export enum ServiceProviderSystem {
    NONE = 'NONE',
    EMAIL = 'EMAIL',
    ITSLEARNING = 'ITSLEARNING',
    UEM = 'UEM',
}

export enum ServiceProviderMerkmal {
    NACHTRAEGLICH_ZUWEISBAR = 'NACHTRAEGLICH_ZUWEISBAR',
    VERFUEGBAR_FUER_ROLLENERWEITERUNG = 'VERFUEGBAR_FUER_ROLLENERWEITERUNG',
    ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG = 'ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG',
    ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG = 'ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG',
}
