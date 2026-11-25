export type LdapPersonEntry = {
    uid: string; //required for posixAccount objectClass
    uidNumber: string; //required for posixAccount objectClass
    gidNumber: string; //required for posixAccount objectClass
    homeDirectory: string; //required for posixAccount objectClass
    cn: string;
    givenName: string;
    sn: string;
    mailPrimaryAddress?: string;
    mailAlternativeAddress?: string;
    objectclass: string[];
    entryUUID?: string;
    personID?: string;
};
