import { DoFactory } from '../../../../test/utils/do-factory.js';
import { UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type PersonEmailResponse } from '../../person/api/person-email-response.js';
import { type Person } from '../../person/domain/person.js';
import { type KontextWithOrgaAndRolle } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { PersonInfoDtoV2 } from './personinfo/v2/person-info.response.v2.js';
import { PersonInfoPersonDtoV2 } from './personinfo/v2/person-info-person.response.v2.js';
import {
    SchulconnexErreichbarkeitTyp,
    SchulconnexGruppeTyp,
    SchulconnexOrganisationTyp,
    SchulconnexPersonenstatus,
    SchulconnexRolle,
} from './schulconnex-enums.js';
import { SchulconnexMapper } from './schulconnex-mapper.js';
import { createMock } from '../../../../test/utils/createMock.js';

describe('SchulconnexMapper', () => {
    const sut: typeof SchulconnexMapper = SchulconnexMapper;
    let person: Person<true>;
    let organisation: Organisation<true>;
    let kontext: KontextWithOrgaAndRolle;
    const email: PersonEmailResponse = { address: 'anna.test@schule-sh.de', status: EmailAddressStatus.ENABLED };

    beforeEach(() => {
        person = DoFactory.createPerson(true, { id: 'person-1', vorname: 'Anna', familienname: 'Test' });
        organisation = DoFactory.createOrganisation(true, {
            id: 'schule-1',
            kennung: '123456',
            name: 'Testschule',
            typ: OrganisationsTyp.SCHULE,
        });
        kontext = {
            personenkontext: DoFactory.createPersonenkontext(true, { id: 'kontext-1' }),
            organisation,
            rolle: DoFactory.createRolle(true, { id: 'rolle-1', rollenart: RollenArt.LERN }),
        };
    });

    it('should map a name independently', () => {
        expect(sut.mapName(person)).toEqual({ vorname: 'Anna', familiennamen: 'Test', familienname: 'Test' });
    });

    it('should map a person independently', () => {
        const result: PersonInfoPersonDtoV2 = sut.mapPerson(person);

        expect(result).toBeInstanceOf(PersonInfoPersonDtoV2);
        expect(JSON.parse(JSON.stringify(result))).toEqual({
            name: { familiennamen: 'Test', familienname: 'Test', vorname: 'Anna' },
        });
    });

    it('should map a role independently', () => {
        kontext.rolle = DoFactory.createRolle(true, { rollenart: RollenArt.LEHR });

        const result: SchulconnexRolle = sut.mapRolle(kontext.rolle);

        expect(result).toBe(SchulconnexRolle.LEHR);
    });

    it('should map the active status for a person without locks independently', () => {
        const result: SchulconnexPersonenstatus | undefined = sut.mapPersonenStatus([]);

        expect(result).toBe(SchulconnexPersonenstatus.AKTIV);
    });

    it('should omit the status for a locked person independently', () => {
        const userlocks: UserLock[] = [createMock(UserLock)];

        const result: SchulconnexPersonenstatus | undefined = sut.mapPersonenStatus(userlocks);

        expect(result).toBeUndefined();
    });

    it.each([
        [OrganisationsTyp.SCHULE, SchulconnexOrganisationTyp.SCHULE],
        [OrganisationsTyp.LAND, SchulconnexOrganisationTyp.SONSTIGE],
    ])('should map organisation type %s to %s', (typ: OrganisationsTyp, expected: SchulconnexOrganisationTyp) => {
        organisation.typ = typ;

        expect(sut.mapOrganisation(organisation)).toEqual({
            id: 'schule-1',
            kennung: '123456',
            name: 'Testschule',
            typ: expected,
        });
    });

    it('should omit missing organisation fields from JSON', () => {
        organisation.kennung = undefined;
        organisation.name = undefined as unknown as string;

        expect(JSON.parse(JSON.stringify(sut.mapOrganisation(organisation)))).toEqual({
            id: 'schule-1',
            typ: SchulconnexOrganisationTyp.SCHULE,
        });
    });

    it.each([
        ['5a', '5a'],
        [undefined, ''],
    ])('should map a group with name %s', (name: string | undefined, expected: string | undefined) => {
        organisation.name = name as unknown as string;

        expect(sut.mapGruppe(organisation)).toEqual({
            id: 'schule-1',
            bezeichnung: expected,
            typ: SchulconnexGruppeTyp.KLASSE,
        });
    });

    it('should map an enabled email independently', () => {
        expect(sut.mapErreichbarkeit(email)).toEqual({
            typ: SchulconnexErreichbarkeitTyp.EMAIL,
            kennung: 'anna.test@schule-sh.de',
        });
    });

    it.each(
        Object.values(EmailAddressStatus).filter((status: EmailAddressStatus) => status !== EmailAddressStatus.ENABLED),
    )('should not expose an email with status %s', (status: EmailAddressStatus) => {
        expect(sut.mapErreichbarkeit({ ...email, status })).toBeNull();
    });

    it('should not expose a missing email', () => {
        expect(sut.mapErreichbarkeit(undefined)).toBeNull();
    });

    it.each([
        [RollenArt.LERN, SchulconnexRolle.LERN],
        [RollenArt.LEHR, SchulconnexRolle.LEHR],
        [RollenArt.LEIT, SchulconnexRolle.LEIT],
        [RollenArt.SYSADMIN, SchulconnexRolle.SYSADMIN],
        [RollenArt.ORGADMIN, SchulconnexRolle.ORGADMIN],
        [RollenArt.EXTERN, SchulconnexRolle.EXTERN],
        [RollenArt.SORGBER, SchulconnexRolle.SORGBER],
        [RollenArt.SCHB, SchulconnexRolle.SCHB],
        [RollenArt.NLEHR, SchulconnexRolle.NLEHR],
    ])('should map context role %s to %s', (rollenart: RollenArt, expected: SchulconnexRolle) => {
        kontext.rolle = DoFactory.createRolle(true, { rollenart });

        expect(sut.mapKontext(kontext, [], [], email).rolle).toBe(expected);
    });

    it('should omit the active status and email for a locked person with a disabled email', () => {
        const result: object = JSON.parse(
            JSON.stringify(
                sut.mapKontext(kontext, [], [createMock(UserLock)], { ...email, status: EmailAddressStatus.DISABLED }),
            ),
        ) as object;

        expect(result).toEqual({
            id: 'kontext-1',
            organisation: { id: 'schule-1', kennung: '123456', name: 'Testschule', typ: 'Schule' },
            rolle: 'Lern',
            spshRolleId: 'rolle-1',
            erreichbarkeiten: [],
            gruppen: [],
        });
    });

    it('should preserve the complete JSON response and associate only classes administered by the school', () => {
        const klasse: KontextWithOrgaAndRolle = {
            ...kontext,
            organisation: DoFactory.createOrganisation(true, {
                id: 'klasse-1',
                typ: OrganisationsTyp.KLASSE,
                administriertVon: organisation.id,
                name: '5a',
            }),
        };
        const fremdeKlasse: KontextWithOrgaAndRolle = {
            ...klasse,
            organisation: DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                administriertVon: 'andere-schule',
            }),
        };

        const result: PersonInfoDtoV2 = sut.mapPersonInfo(person, [klasse, kontext, fremdeKlasse], email, []);

        expect(result).toBeInstanceOf(PersonInfoDtoV2);
        expect(JSON.parse(JSON.stringify(result))).toEqual({
            pid: 'person-1',
            person: { name: { familiennamen: 'Test', familienname: 'Test', vorname: 'Anna' } },
            personenkontexte: [
                {
                    id: 'kontext-1',
                    organisation: { id: 'schule-1', kennung: '123456', name: 'Testschule', typ: 'Schule' },
                    rolle: 'Lern',
                    spshRolleId: 'rolle-1',
                    erreichbarkeiten: [{ typ: 'E-Mail', kennung: 'anna.test@schule-sh.de' }],
                    personenstatus: SchulconnexPersonenstatus.AKTIV,
                    gruppen: [{ id: 'klasse-1', bezeichnung: '5a', typ: 'Klasse' }],
                },
            ],
            beziehungen: [],
        });
    });

    it('should preserve the order of primary contexts', () => {
        const weitererKontext: KontextWithOrgaAndRolle = {
            ...kontext,
            personenkontext: DoFactory.createPersonenkontext(true, { id: 'kontext-2' }),
        };

        const result: PersonInfoDtoV2 = sut.mapPersonInfo(person, [weitererKontext, kontext], undefined, []);

        expect(result.personenkontexte.map((response: { id: string }) => response.id)).toEqual([
            'kontext-2',
            'kontext-1',
        ]);
    });

    it('should map a person without contexts', () => {
        expect(JSON.parse(JSON.stringify(sut.mapPersonInfo(person, [], undefined, [])))).toEqual({
            pid: 'person-1',
            person: { name: { familiennamen: 'Test', familienname: 'Test', vorname: 'Anna' } },
            personenkontexte: [],
            beziehungen: [],
        });
    });
});
