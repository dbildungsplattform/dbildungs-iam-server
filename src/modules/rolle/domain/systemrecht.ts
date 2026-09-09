export enum RollenSystemRechtEnum {
    ROLLEN_VERWALTEN = 'ROLLEN_VERWALTEN',
    MPT_ROLLEN_VERWALTEN = 'MPT_ROLLEN_VERWALTEN',
    PERSONEN_SOFORT_LOESCHEN = 'PERSONEN_SOFORT_LOESCHEN', // Implicitly requires PERSONEN_VERWALTEN to be usable in the frontend
    PERSONEN_VERWALTEN = 'PERSONEN_VERWALTEN',
    LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN = 'LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN',
    EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN = 'EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN',
    SCHULEN_VERWALTEN = 'SCHULEN_VERWALTEN',
    KLASSEN_VERWALTEN = 'KLASSEN_VERWALTEN',
    SCHULTRAEGER_VERWALTEN = 'SCHULTRAEGER_VERWALTEN',
    PERSON_SYNCHRONISIEREN = 'PERSON_SYNCHRONISIEREN',
    CRON_DURCHFUEHREN = 'CRON_DURCHFUEHREN',
    PERSONEN_ANLEGEN = 'PERSONEN_ANLEGEN',
    IMPORT_DURCHFUEHREN = 'IMPORT_DURCHFUEHREN', // Requires PERSONEN_VERWALTEN (later PERSONEN_ERSTELLEN !!!) to work
    PERSONEN_LESEN = 'PERSONEN_LESEN',
    BULK_VERWALTEN = 'BULK_VERWALTEN', // For Admins that can do bulk operations like adding personenkontexte to 100 users at once.
    SCHULPORTAL_VERWALTEN = 'SCHULPORTAL_VERWALTEN',
    HINWEISE_BEARBEITEN = 'HINWEISE_BEARBEITEN',
    ROLLEN_ERWEITERN = 'ROLLEN_ERWEITERN',
    ANGEBOTE_VERWALTEN = 'ANGEBOTE_VERWALTEN',
    ANGEBOTE_EINGESCHRAENKT_VERWALTEN = 'ANGEBOTE_EINGESCHRAENKT_VERWALTEN',
    SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN = 'SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN',
}

export class RollenSystemRecht {
    private constructor(
        private technicalInternal: boolean,
        private nameInternal: RollenSystemRechtEnum,
    ) {}

    public get technical(): boolean {
        return this.technicalInternal;
    }

    public get name(): RollenSystemRechtEnum {
        return this.nameInternal;
    }

    public static readonly ROLLEN_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.ROLLEN_VERWALTEN,
    );

    public static readonly MPT_ROLLEN_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN,
    );

    // Implicitly requires PERSONEN_VERWALTEN to be usable in the frontend
    public static readonly PERSONEN_SOFORT_LOESCHEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.PERSONEN_SOFORT_LOESCHEN,
    );

    public static readonly PERSONEN_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.PERSONEN_VERWALTEN,
    );

    public static readonly LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN,
    );

    public static readonly EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
    );

    public static readonly SCHULEN_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.SCHULEN_VERWALTEN,
    );

    public static readonly KLASSEN_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.KLASSEN_VERWALTEN,
    );

    public static readonly SCHULTRAEGER_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.SCHULTRAEGER_VERWALTEN,
    );

    public static readonly PERSON_SYNCHRONISIEREN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.PERSON_SYNCHRONISIEREN,
    );

    public static readonly CRON_DURCHFUEHREN: RollenSystemRecht = new RollenSystemRecht(
        true,
        RollenSystemRechtEnum.CRON_DURCHFUEHREN,
    );

    public static readonly PERSONEN_ANLEGEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.PERSONEN_ANLEGEN,
    );

    // Requires PERSONEN_VERWALTEN (later PERSONEN_ERSTELLEN !!!) to work
    public static readonly IMPORT_DURCHFUEHREN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.IMPORT_DURCHFUEHREN,
    );

    public static readonly PERSONEN_LESEN: RollenSystemRecht = new RollenSystemRecht(
        true,
        RollenSystemRechtEnum.PERSONEN_LESEN,
    );

    // For Admins that can do bulk operations like adding personenkontexte to 100 users at once.
    public static readonly BULK_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.BULK_VERWALTEN,
    );

    public static readonly SCHULPORTAL_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.SCHULPORTAL_VERWALTEN,
    );

    public static readonly HINWEISE_BEARBEITEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.HINWEISE_BEARBEITEN,
    );

    public static readonly ROLLEN_ERWEITERN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.ROLLEN_ERWEITERN,
    );

    public static readonly ANGEBOTE_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.ANGEBOTE_VERWALTEN,
    );

    public static readonly ANGEBOTE_EINGESCHRAENKT_VERWALTEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.ANGEBOTE_EINGESCHRAENKT_VERWALTEN,
    );

    public static readonly SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN: RollenSystemRecht = new RollenSystemRecht(
        false,
        RollenSystemRechtEnum.SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN,
    );

    public static readonly ALL: RollenSystemRecht[] = [
        RollenSystemRecht.ROLLEN_VERWALTEN,
        RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
        RollenSystemRecht.PERSONEN_SOFORT_LOESCHEN,
        RollenSystemRecht.PERSONEN_VERWALTEN,
        RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN,
        RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN,
        RollenSystemRecht.SCHULEN_VERWALTEN,
        RollenSystemRecht.KLASSEN_VERWALTEN,
        RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
        RollenSystemRecht.PERSON_SYNCHRONISIEREN,
        RollenSystemRecht.CRON_DURCHFUEHREN,
        RollenSystemRecht.PERSONEN_ANLEGEN,
        RollenSystemRecht.IMPORT_DURCHFUEHREN,
        RollenSystemRecht.PERSONEN_LESEN,
        RollenSystemRecht.BULK_VERWALTEN,
        RollenSystemRecht.SCHULPORTAL_VERWALTEN,
        RollenSystemRecht.HINWEISE_BEARBEITEN,
        RollenSystemRecht.ROLLEN_ERWEITERN,
        RollenSystemRecht.ANGEBOTE_VERWALTEN,
        RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN,
        RollenSystemRecht.SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN,
    ];

    public static getByName(name: RollenSystemRechtEnum): RollenSystemRecht {
        switch (name) {
            case RollenSystemRechtEnum.ROLLEN_VERWALTEN:
                return RollenSystemRecht.ROLLEN_VERWALTEN;
            case RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN:
                return RollenSystemRecht.MPT_ROLLEN_VERWALTEN;
            case RollenSystemRechtEnum.PERSONEN_SOFORT_LOESCHEN:
                return RollenSystemRecht.PERSONEN_SOFORT_LOESCHEN;
            case RollenSystemRechtEnum.PERSONEN_VERWALTEN:
                return RollenSystemRecht.PERSONEN_VERWALTEN;
            case RollenSystemRechtEnum.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN:
                return RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN;
            case RollenSystemRechtEnum.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN:
                return RollenSystemRecht.EINGESCHRAENKT_NEUE_BENUTZER_ERSTELLEN;
            case RollenSystemRechtEnum.SCHULEN_VERWALTEN:
                return RollenSystemRecht.SCHULEN_VERWALTEN;
            case RollenSystemRechtEnum.KLASSEN_VERWALTEN:
                return RollenSystemRecht.KLASSEN_VERWALTEN;
            case RollenSystemRechtEnum.SCHULTRAEGER_VERWALTEN:
                return RollenSystemRecht.SCHULTRAEGER_VERWALTEN;
            case RollenSystemRechtEnum.PERSON_SYNCHRONISIEREN:
                return RollenSystemRecht.PERSON_SYNCHRONISIEREN;
            case RollenSystemRechtEnum.CRON_DURCHFUEHREN:
                return RollenSystemRecht.CRON_DURCHFUEHREN;
            case RollenSystemRechtEnum.PERSONEN_ANLEGEN:
                return RollenSystemRecht.PERSONEN_ANLEGEN;
            case RollenSystemRechtEnum.IMPORT_DURCHFUEHREN:
                return RollenSystemRecht.IMPORT_DURCHFUEHREN;
            case RollenSystemRechtEnum.PERSONEN_LESEN:
                return RollenSystemRecht.PERSONEN_LESEN;
            case RollenSystemRechtEnum.BULK_VERWALTEN:
                return RollenSystemRecht.BULK_VERWALTEN;
            case RollenSystemRechtEnum.SCHULPORTAL_VERWALTEN:
                return RollenSystemRecht.SCHULPORTAL_VERWALTEN;
            case RollenSystemRechtEnum.HINWEISE_BEARBEITEN:
                return RollenSystemRecht.HINWEISE_BEARBEITEN;
            case RollenSystemRechtEnum.ROLLEN_ERWEITERN:
                return RollenSystemRecht.ROLLEN_ERWEITERN;
            case RollenSystemRechtEnum.ANGEBOTE_VERWALTEN:
                return RollenSystemRecht.ANGEBOTE_VERWALTEN;
            case RollenSystemRechtEnum.ANGEBOTE_EINGESCHRAENKT_VERWALTEN:
                return RollenSystemRecht.ANGEBOTE_EINGESCHRAENKT_VERWALTEN;
            case RollenSystemRechtEnum.SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN:
                return RollenSystemRecht.SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN;
        }
    }
}
export const RollenSystemRechtEnumName: string = 'RollenSystemRechtEnum';
