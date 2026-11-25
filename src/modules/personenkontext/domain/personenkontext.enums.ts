export const PersonenstatusTypName: string = 'Personenstatus';
export const SichtfreigabeTypName: string = 'Sichtfreigabe';

export enum Personenstatus {
    AKTIV = 'AKTIV',
}

export enum Jahrgangsstufe {
    JAHRGANGSSTUFE_1 = '01',
    JAHRGANGSSTUFE_2 = '02',
    JAHRGANGSSTUFE_3 = '03',
    JAHRGANGSSTUFE_4 = '04',
    JAHRGANGSSTUFE_5 = '05',
    JAHRGANGSSTUFE_6 = '06',
    JAHRGANGSSTUFE_7 = '07',
    JAHRGANGSSTUFE_8 = '08',
    JAHRGANGSSTUFE_9 = '09',
    JAHRGANGSSTUFE_10 = '10',
}

export enum SichtfreigabeType {
    JA = 'ja',
    NEIN = 'nein',
}

export enum OperationContext {
    PERSON_ANLEGEN = 'PERSON_ANLEGEN',
    PERSON_BEARBEITEN = 'PERSON_BEARBEITEN',
    LANDESBEDIENSTETEN_KONTEXT_ERWEITERN = 'LANDESBEDIENSTETEN_KONTEXT_ERWEITERN',
}
