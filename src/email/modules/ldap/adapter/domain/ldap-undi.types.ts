export type LdapUndiPersonEntry = {
    uid: string;
    cn: string;
    givenName: string;
    sn: string;
    mailPrimaryAddress?: string;
    mailAlternativeAddress?: string;
    objectclass: string[];
    entryUUID?: string;
    personID?: string;
};

export enum LdapUndiEntityType {
    LEHRER = 'LEHRER',
}
