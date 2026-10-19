import { Injectable } from '@nestjs/common';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { PersonEmailResponse } from '../../person/api/person-email-response.js';
import { Person } from '../../person/domain/person.js';
import { KontextWithOrgaAndRolle } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonInfoPersonNameResponseV1 } from '../api/personinfo/v1/person-info-person-name.response.v1.js';
import { PersonInfoKontextErreichbarkeitResponseV2 } from '../api/personinfo/v2/person-info-kontext-erreichbarkeit.response.v2.js';
import { PersonenInfoKontextGruppeResponseV2 } from '../api/personinfo/v2/person-info-kontext-gruppe.response.v2.js';
import { PersonenInfoKontextOrganisationResponseV2 } from '../api/personinfo/v2/person-info-kontext-organisation.response.v2.js';
import { PersonInfoKontextResponseV2 } from '../api/personinfo/v2/person-info-kontext.response.v2.js';
import { PersonInfoPersonResponseV2 } from '../api/personinfo/v2/person-info-person.response.v2.js';
import { PersonInfoResponseV2 } from '../api/personinfo/v2/person-info.response.v2.js';
import {
    convertSPSHRollenartToSchulconnexRolle,
    SchulconnexErreichbarkeitTyp,
    SchulconnexGruppeTyp,
    SchulconnexOrganisationTyp,
    SchulconnexPersonenstatus,
    SchulconnexRolle,
} from '../api/schulconnex-enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';

@Injectable()
export class SchulconnexMapperService {
    public mapPersonInfo(
        person: Person<true>,
        kontexteWithOrgaAndRolle: KontextWithOrgaAndRolle[],
        email: Option<PersonEmailResponse>,
        userlocks: UserLock[],
    ): PersonInfoResponseV2 {
        const primaryKontexte: KontextWithOrgaAndRolle[] = kontexteWithOrgaAndRolle.filter(
            (kontext: KontextWithOrgaAndRolle) => kontext.organisation.typ !== OrganisationsTyp.KLASSE,
        );
        const klassenKontexte: KontextWithOrgaAndRolle[] = kontexteWithOrgaAndRolle.filter(
            (kontext: KontextWithOrgaAndRolle) => kontext.organisation.typ === OrganisationsTyp.KLASSE,
        );
        const kontexte: PersonInfoKontextResponseV2[] = primaryKontexte.map(
            (primaryKontext: KontextWithOrgaAndRolle) => {
                const associatedKlassenKontexte: KontextWithOrgaAndRolle[] = klassenKontexte.filter(
                    (klassenKontext: KontextWithOrgaAndRolle) =>
                        klassenKontext.organisation.administriertVon === primaryKontext.organisation.id,
                );
                return this.mapKontext(primaryKontext, associatedKlassenKontexte, userlocks, email ?? undefined);
            },
        );
        return new PersonInfoResponseV2(person.id, this.mapPerson(person), kontexte);
    }

    public mapPerson(person: Person<true>): PersonInfoPersonResponseV2 {
        return new PersonInfoPersonResponseV2(this.mapName(person));
    }

    public mapKontext(
        primaryNonKlassenKontext: KontextWithOrgaAndRolle,
        associatedKlassenKontexte: KontextWithOrgaAndRolle[],
        userlocks: UserLock[],
        email?: PersonEmailResponse,
    ): PersonInfoKontextResponseV2 {
        const erreichbarkeit: PersonInfoKontextErreichbarkeitResponseV2 | null = this.mapErreichbarkeit(email);
        return new PersonInfoKontextResponseV2({
            id: primaryNonKlassenKontext.personenkontext.id,
            organisation: this.mapOrganisation(primaryNonKlassenKontext.organisation),
            rolle: this.mapRolle(primaryNonKlassenKontext.rolle),
            erreichbarkeiten: erreichbarkeit ? [erreichbarkeit] : [],
            personenstatus: this.mapPersonenStatus(userlocks),
            gruppen: associatedKlassenKontexte.map((kontext: KontextWithOrgaAndRolle) =>
                this.mapGruppe(kontext.organisation),
            ),
        });
    }

    public mapName(person: Person<true>): PersonInfoPersonNameResponseV1 {
        return new PersonInfoPersonNameResponseV1({
            vorname: person.vorname,
            familiennamen: person.familienname,
        });
    }

    public mapPersonenStatus(userlocks: UserLock[]): SchulconnexPersonenstatus | undefined {
        return userlocks.length > 0 ? undefined : SchulconnexPersonenstatus.AKTIV;
    }

    public mapRolle(rolle: Rolle<true>): SchulconnexRolle {
        return convertSPSHRollenartToSchulconnexRolle(rolle.rollenart);
    }

    public mapOrganisation(organisation: Organisation<true>): PersonenInfoKontextOrganisationResponseV2 {
        return PersonenInfoKontextOrganisationResponseV2.createNew({
            id: organisation.id,
            kennung: organisation.kennung,
            name: organisation.name,
            typ:
                organisation.typ === OrganisationsTyp.SCHULE
                    ? SchulconnexOrganisationTyp.SCHULE
                    : SchulconnexOrganisationTyp.SONSTIGE,
        });
    }

    public mapGruppe(organisation: Organisation<true>): PersonenInfoKontextGruppeResponseV2 {
        return PersonenInfoKontextGruppeResponseV2.createNew({
            id: organisation.id,
            bezeichnung: organisation.name ?? '',
            typ: SchulconnexGruppeTyp.KLASSE,
        });
    }

    public mapErreichbarkeit(email: Option<PersonEmailResponse>): PersonInfoKontextErreichbarkeitResponseV2 | null {
        return email?.status === EmailAddressStatus.ENABLED
            ? new PersonInfoKontextErreichbarkeitResponseV2({
                  typ: SchulconnexErreichbarkeitTyp.EMAIL,
                  kennung: email.address,
              })
            : null;
    }
}
