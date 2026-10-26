import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { type UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type PersonEmailResponse } from '../../person/api/person-email-response.js';
import { type Person } from '../../person/domain/person.js';
import { type KontextWithOrgaAndRolle } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonInfoKontextErreichbarkeitDtoV2 } from '../api/personinfo/v2/person-info-kontext-erreichbarkeit.response.v2.js';
import { PersonenInfoKontextGruppeDtoV2 } from '../api/personinfo/v2/person-info-kontext-gruppe.response.v2.js';
import { PersonenInfoKontextOrganisationDtoV2 } from '../api/personinfo/v2/person-info-kontext-organisation.response.v2.js';
import { PersonInfoKontextDtoV2 } from '../api/personinfo/v2/person-info-kontext.response.v2.js';
import { PersonInfoPersonDtoV2 } from '../api/personinfo/v2/person-info-person.response.v2.js';
import { PersonInfoDtoV2 } from '../api/personinfo/v2/person-info.response.v2.js';
import {
    convertSPSHRollenartToSchulconnexRolle,
    SchulconnexErreichbarkeitTyp,
    SchulconnexGruppeTyp,
    SchulconnexOrganisationTyp,
    SchulconnexPersonenstatus,
    type SchulconnexRolle,
} from '../api/schulconnex-enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { PersonInfoPersonNameDtoV2 } from '../api/personinfo/v2/person-info-person-name.response.v2.js';

export class SchulconnexMapper {
    public static mapPersonInfo(
        person: Person<true>,
        kontexteWithOrgaAndRolle: KontextWithOrgaAndRolle[],
        email: Option<PersonEmailResponse>,
        userlocks: UserLock[],
    ): PersonInfoDtoV2 {
        const primaryKontexte: KontextWithOrgaAndRolle[] = kontexteWithOrgaAndRolle.filter(
            (kontext: KontextWithOrgaAndRolle) => kontext.organisation.typ !== OrganisationsTyp.KLASSE,
        );
        const klassenKontexte: KontextWithOrgaAndRolle[] = kontexteWithOrgaAndRolle.filter(
            (kontext: KontextWithOrgaAndRolle) => kontext.organisation.typ === OrganisationsTyp.KLASSE,
        );
        const kontexte: PersonInfoKontextDtoV2[] = primaryKontexte.map((primaryKontext: KontextWithOrgaAndRolle) => {
            const associatedKlassenKontexte: KontextWithOrgaAndRolle[] = klassenKontexte.filter(
                (klassenKontext: KontextWithOrgaAndRolle) =>
                    klassenKontext.organisation.administriertVon === primaryKontext.organisation.id,
            );
            return SchulconnexMapper.mapKontext(
                primaryKontext,
                associatedKlassenKontexte,
                userlocks,
                email ?? undefined,
            );
        });
        return new PersonInfoDtoV2(person.id, SchulconnexMapper.mapPerson(person), kontexte);
    }

    public static mapPerson(person: Person<true>): PersonInfoPersonDtoV2 {
        return new PersonInfoPersonDtoV2(SchulconnexMapper.mapName(person));
    }

    public static mapKontext(
        primaryNonKlassenKontext: KontextWithOrgaAndRolle,
        associatedKlassenKontexte: KontextWithOrgaAndRolle[],
        userlocks: UserLock[],
        email?: PersonEmailResponse,
    ): PersonInfoKontextDtoV2 {
        const erreichbarkeit: PersonInfoKontextErreichbarkeitDtoV2 | null = SchulconnexMapper.mapErreichbarkeit(email);
        return new PersonInfoKontextDtoV2({
            id: primaryNonKlassenKontext.personenkontext.id,
            organisation: SchulconnexMapper.mapOrganisation(primaryNonKlassenKontext.organisation),
            rolle: SchulconnexMapper.mapRolle(primaryNonKlassenKontext.rolle),
            erreichbarkeiten: erreichbarkeit ? [erreichbarkeit] : [],
            personenstatus: SchulconnexMapper.mapPersonenStatus(userlocks),
            gruppen: associatedKlassenKontexte.map((kontext: KontextWithOrgaAndRolle) =>
                SchulconnexMapper.mapGruppe(kontext.organisation),
            ),
        });
    }

    public static mapName(person: Person<true>): PersonInfoPersonNameDtoV2 {
        return new PersonInfoPersonNameDtoV2({
            vorname: person.vorname,
            familiennamen: person.familienname,
        });
    }

    public static mapPersonenStatus(userlocks: UserLock[]): SchulconnexPersonenstatus | undefined {
        return userlocks.length > 0 ? undefined : SchulconnexPersonenstatus.AKTIV;
    }

    public static mapRolle(rolle: Rolle<true>): SchulconnexRolle {
        return convertSPSHRollenartToSchulconnexRolle(rolle.rollenart);
    }

    public static mapOrganisation(organisation: Organisation<true>): PersonenInfoKontextOrganisationDtoV2 {
        return PersonenInfoKontextOrganisationDtoV2.createNew({
            id: organisation.id,
            kennung: organisation.kennung,
            name: organisation.name,
            typ:
                organisation.typ === OrganisationsTyp.SCHULE
                    ? SchulconnexOrganisationTyp.SCHULE
                    : SchulconnexOrganisationTyp.SONSTIGE,
        });
    }

    public static mapGruppe(organisation: Organisation<true>): PersonenInfoKontextGruppeDtoV2 {
        return PersonenInfoKontextGruppeDtoV2.createNew({
            id: organisation.id,
            bezeichnung: organisation.name ?? '',
            typ: SchulconnexGruppeTyp.KLASSE,
        });
    }

    public static mapErreichbarkeit(email: Option<PersonEmailResponse>): PersonInfoKontextErreichbarkeitDtoV2 | null {
        return email?.status === EmailAddressStatus.ENABLED
            ? new PersonInfoKontextErreichbarkeitDtoV2({
                  typ: SchulconnexErreichbarkeitTyp.EMAIL,
                  kennung: email.address,
              })
            : null;
    }
}
