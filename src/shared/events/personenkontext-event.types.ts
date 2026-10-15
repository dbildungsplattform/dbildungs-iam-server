import { type OrganisationsTyp } from '../../modules/organisation/domain/organisation.enums.js';
import { type RollenArt } from '../../modules/rolle/domain/rolle.enums.js';
import { type ServiceProviderSystem } from '../../modules/service-provider/domain/service-provider.enum.js';
import { type OrganisationID, type PersonenkontextID, type PersonID, type RolleID } from '../types/index.js';

export type PersonenkontextEventPersonData = {
    id: PersonID;
    vorname: string;
    familienname: string;
    username?: string;
    keycloakUserId?: string;
    email?: string;
};

export type PersonenkontextEventKontextData = {
    id: PersonenkontextID;

    rolleId: RolleID;
    rolle: RollenArt;
    orgaId: OrganisationID;
    parentOrgaId?: OrganisationID;
    orgaTyp?: OrganisationsTyp;
    orgaKennung?: string;

    isItslearningOrga: boolean;

    serviceProviderExternalSystems: ServiceProviderSystem[];
};
