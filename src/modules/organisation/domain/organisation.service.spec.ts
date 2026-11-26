import { faker } from '@faker-js/faker';
import { type MockInstance } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { EntityCouldNotBeCreated } from '../../../shared/error/entity-could-not-be-created.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { type DomainError, EntityCouldNotBeUpdated, MissingPermissionsError } from '../../../shared/error/index.js';
import { type Paged } from '../../../shared/paging/index.js';
import { type OrganisationID } from '../../../shared/types/aggregate-ids.types.js';
import {
    type PersonenkontextRolleWithOrganisation,
    type PersonPermissions,
} from '../../authentication/domain/person-permissions.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { RelationshipSearchUnsupportedOrganisationTypeError } from '../specification/error/relationship-search-unsupported-organisation-type.error.js';
import { BehoerdeAdministriertVonError } from '../specification/error/behoerde-administriert-von.error.js';
import { BehoerdeNameEindeutigError } from '../specification/error/behoerde-name-eindeutig.error.js';
import { EmailAdressOnOrganisationTypError } from '../specification/error/email-adress-on-organisation-typ-error.js';
import { KennungOnlyForSchuleError } from '../specification/error/kennung-only-for-schule.error.js';
import { KennungRequiredForSchuleError } from '../specification/error/kennung-required-for-schule.error.js';
import { KennungForOrganisationWithTrailingSpaceError } from '../specification/error/kennung-with-trailing-space.error.js';
import { KlasseNurVonSchuleAdministriertError } from '../specification/error/klasse-nur-von-schule-administriert.error.js';
import { KlasseWithoutNumberOrLetterError } from '../specification/error/klasse-without-number-or-letter.error.js';
import { NameRequiredForSchuleError } from '../specification/error/name-required-for-schule.error.js';
import { NameForOrganisationWithTrailingSpaceError } from '../specification/error/name-with-trailing-space.error.js';
import { SchuleKennungEindeutigError } from '../specification/error/schule-kennung-eindeutig.error.js';
import { SchulaufsichtQuelleSchuleZielBehoerdeError } from '../specification/relations/error/schulaufsicht-quelle-schule-ziel-behoerde.error.js';
import { SchulaufsichtSchuleUndAufsichtSelberBaumError } from '../specification/relations/error/schulaufsicht-schule-und-aufsicht-selber-baum.error.js';
import { SchultraegerQuelleSchuleZielTraegerError } from '../specification/relations/error/schultraeger-quelle-schule-ziel-traeger.error.js';
import { SchultraegerSchuleHatExaktEinenTraegerError } from '../specification/relations/error/schultraeger-schule-hat-exakt-einen-traeger.error.js';
import { SchultraegerSchuleUndTraegerSelberBaumError } from '../specification/relations/error/schultraeger-schule-und-traeger-selber-baum.error.js';
import { SchulaufsichtQuelleSchuleZielBehoerde } from '../specification/relations/schulaufsicht-quelle-schule-ziel-behoerde.js';
import { SchulaufsichtSchuleUndAufsichtSelberBaum } from '../specification/relations/schulaufsicht-schule-und-aufsicht-selber-baum.js';
import { SchultraegerQuelleSchuleZielTraeger } from '../specification/relations/schultraeger-quelle-schule-ziel-traeger.js';
import { SchultraegerSchuleHatExaktEinenTraeger } from '../specification/relations/schultraeger-schule-hat-exakt-einen-traeger.js';
import { SchultraegerSchuleUndTraegerSelberBaum } from '../specification/relations/schultraeger-schule-und-traeger-selber-baum.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerUnterRootChildError } from '../specification/error/traeger-unter-root-child.error.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { ZyklusInOrganisationenError } from '../specification/error/zyklus-in-organisationen.error.js';
import { OrganisationsTyp, Traegerschaft } from './organisation.enums.js';
import {
    type Organisationsbeziehungen,
    Organisation,
    type Organisationsbeziehung,
    type OrganisationsbeziehungWithOrganisationen,
} from './organisation.js';
import { OrganisationService, type UpdateOrganisationData } from './organisation.service.js';
import { OrganisationsbeziehungsTyp } from './organisationsbeziehungs-typ.enum.js';

function createOrganisation<WasPersisted extends boolean, RelationshipsLoaded extends boolean = false>(
    withId: WasPersisted,
    props?: Partial<Organisation<WasPersisted, RelationshipsLoaded>>,
    organisationsbeziehungen: RelationshipsLoaded extends true
        ? Organisationsbeziehungen
        : undefined = undefined as RelationshipsLoaded extends true ? Organisationsbeziehungen : undefined,
): Organisation<WasPersisted, RelationshipsLoaded> {
    const typ: OrganisationsTyp = props?.typ ?? OrganisationsTyp.SONSTIGE;

    return Organisation.construct<WasPersisted, RelationshipsLoaded>(
        (withId ? (props?.id ?? faker.string.uuid()) : undefined) as Persisted<string, WasPersisted>,
        (withId ? (props?.createdAt ?? faker.date.past()) : undefined) as Persisted<Date, WasPersisted>,
        (withId ? (props?.updatedAt ?? faker.date.recent()) : undefined) as Persisted<Date, WasPersisted>,
        props?.version ?? faker.number.int(),
        props?.name ?? faker.lorem.word(),
        typ,
        organisationsbeziehungen,
        props?.administriertVon,
        typ === OrganisationsTyp.SCHULE ? (props?.kennung ?? '1234567') : props?.kennung,
        props?.namensergaenzung,
        props?.kuerzel,
        props?.traegerschaft,
        props?.emailAdress,
        props?.uemLdapOu,
        props?.itslearningEnabled,
    );
}

describe('OrganisationService', () => {
    let module: TestingModule;
    let organisationService: OrganisationService;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule],
            providers: [
                OrganisationService,
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
            ],
        }).compile();
        organisationService = module.get(OrganisationService);
        organisationRepositoryMock = module.get(OrganisationRepository);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(organisationService).toBeDefined();
    });

    describe('createOrganisation', () => {
        const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        it.each(Object.values(OrganisationsTyp).filter((typ: OrganisationsTyp) => typ !== OrganisationsTyp.SCHULE))(
            'should reject a kennung for %s before saving',
            async (typ: OrganisationsTyp) => {
                const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                    typ,
                    kennung: '1234567',
                });

                const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                    organisation,
                    permissionsMock,
                );

                expect(result).toEqual({ ok: false, error: new KennungOnlyForSchuleError() });
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            },
        );

        const organisationUser: Organisation<true> = DoFactory.createOrganisation(true);
        const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
            {
                organisation: organisationUser,
                rolle: { systemrechte: [], serviceProviderIds: [] },
            },
        ];

        it('should create an organisation', async () => {
            const organisation: Organisation<false> = createOrganisation(false);
            organisationRepositoryMock.save.mockResolvedValue(organisation as unknown as Organisation<true>);
            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: organisation as unknown as Organisation<true>,
            });
        });

        it('should create a Schule and log its creation', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationUser);
            const schule: Organisation<false> = DoFactory.createOrganisation(false);
            schule.typ = OrganisationsTyp.SCHULE;
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
            organisationRepositoryMock.save.mockResolvedValue(schule as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                schule,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: schule as unknown as Organisation<true>,
            });
        });

        it('should create a Klasse and log its creation', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true);
            const klasse: Organisation<false> = createOrganisation(false);
            schule.typ = OrganisationsTyp.SCHULE;
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.administriertVon = schule.id;
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.save.mockResolvedValue(klasse as unknown as Organisation<true>);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.exists.mockResolvedValue(true);
            organisationRepositoryMock.findChildOrgasForIds.mockResolvedValueOnce([]);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                klasse,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: klasse as unknown as Organisation<true>,
            });
        });

        it('should fail to create a Klasse and log the creation attempt', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            const klasse: Organisation<false> = createOrganisation(false);
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.administriertVon = schule.id;
            organisationRepositoryMock.exists.mockResolvedValue(true);
            organisationRepositoryMock.exists.mockResolvedValue(true);
            organisationRepositoryMock.save.mockResolvedValue(klasse as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                klasse,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KlasseNurVonSchuleAdministriertError(),
            });
        });

        it('should fail to create a Klasse if another Klasse of the Schule has the same name', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const sibling: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '1a',
            });
            const klasse: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.KLASSE,
                name: '1a',
                kennung: undefined,
                administriertVon: schule.id,
            });
            organisationRepositoryMock.findById.mockResolvedValue(schule);
            organisationRepositoryMock.exists.mockResolvedValue(true);
            organisationRepositoryMock.findChildOrgasForIds.mockResolvedValue([sibling]);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                klasse,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KlassenNameAnSchuleEindeutigError(undefined),
            });
        });

        it('should return a domain error if first parent organisation does not exist', async () => {
            const organisation: Organisation<false> = createOrganisation(false);
            organisation.administriertVon = faker.string.uuid();
            organisationRepositoryMock.exists.mockResolvedValueOnce(false);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EntityNotFoundError('Organisation', organisation.administriertVon),
            });
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
        });

        it('should return a domain error if kennung is not set and type is schule', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);

            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                kennung: undefined,
            });
            organisationRepositoryMock.save.mockResolvedValue(organisation as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KennungRequiredForSchuleError(),
            });
        });

        it('should return a domain error if name is not set and type is schule', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);

            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                kennung: '1234567',
                name: undefined,
            });
            organisationRepositoryMock.save.mockResolvedValue(organisation as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new NameRequiredForSchuleError(),
            });
        });

        it('should return a domain error if type is klasse and email is set', async () => {
            const organisation: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.KLASSE,
                emailAdress: 'klassenmail123@spsh.de',
                name: 'Klasse123',
            });
            organisationRepositoryMock.save.mockResolvedValue(organisation as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EmailAdressOnOrganisationTypError(),
            });
        });

        it('should return a domain error if kennung is not unique and type is schule', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);

            const name: string = faker.string.alpha();
            const kennung: string = faker.string.numeric({ length: 7 });
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                kennung: kennung,
                name: name,
            });
            const counted: Counted<Organisation<true>> = [
                [
                    DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.SCHULE,
                        kennung: kennung,
                        name: name,
                    }),
                ],
                1,
            ];
            organisationRepositoryMock.findBy.mockResolvedValueOnce(counted);
            organisationRepositoryMock.save.mockResolvedValue(organisation as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new SchuleKennungEindeutigError(),
            });
        });

        it('should return a domain error', async () => {
            const organisation: Organisation<false> = createOrganisation(false);
            organisation.id = faker.string.uuid();
            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EntityCouldNotBeCreated(`Organization could not be created`),
            });
        });

        it('should return domain error if name contains trailing space', async () => {
            const organisationDo: Organisation<false> = createOrganisation(false, { name: ' name' });
            organisationRepositoryMock.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisationDo,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new NameForOrganisationWithTrailingSpaceError(),
            });
        });

        it('should return domain error if kennung contains trailing space', async () => {
            const organisationDo: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                kennung: ' ',
            });
            organisationRepositoryMock.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisationDo,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KennungForOrganisationWithTrailingSpaceError(),
            });
        });

        it('should return domain error if name contains no letter nor number', async () => {
            const organisationDo: Organisation<false> = createOrganisation(false, {
                name: '-',
                typ: OrganisationsTyp.KLASSE,
            });
            organisationRepositoryMock.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisationDo,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KlasseWithoutNumberOrLetterError(),
            });
        });

        it('should successfully validate when Schulträger name is unique', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationUser);
            organisationRepositoryMock.exists.mockResolvedValue(true);
            organisationRepositoryMock.findRootDirectChildren.mockResolvedValue([undefined, undefined]);

            const name: string = faker.company.name();

            const oeffentlich: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            });

            const ersatz: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            });

            const existingSchultraeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                name,
                administriertVon: ersatz.id,
            });
            const schultraeger: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.TRAEGER,
                name,
                administriertVon: oeffentlich.id,
            });

            // Returns an existing Schulträger with the same name
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[existingSchultraeger], 1]);

            // mock root nodes for specification
            organisationRepositoryMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisationAggregate(true, { typ: OrganisationsTyp.ROOT }),
            );
            organisationRepositoryMock.findRootDirectChildren.mockResolvedValueOnce([oeffentlich, ersatz]);

            organisationRepositoryMock.save.mockResolvedValueOnce(schultraeger as unknown as Organisation<true>);

            // Call the method
            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                schultraeger,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: schultraeger as unknown as Organisation<true>,
            });
        });

        it('should return a domain error if Schulträger name is not unique', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);
            organisationRepositoryMock.exists.mockResolvedValue(true);
            organisationRepositoryMock.isOrgaAParentOfOrgaB.mockResolvedValue(true);

            const name: string = faker.company.name();
            const oeffentlich: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            });
            const schultraeger: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.TRAEGER,
                name: name,
                administriertVon: oeffentlich.id,
            });

            const existingSchultraeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                name: name,
                administriertVon: oeffentlich.id,
            });

            // Returns an existing Schulträger with the same name
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[existingSchultraeger], 1]);

            // mock root nodes for specification
            organisationRepositoryMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisationAggregate(true, { typ: OrganisationsTyp.ROOT }),
            );
            organisationRepositoryMock.findRootDirectChildren.mockResolvedValue([oeffentlich, undefined]);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                schultraeger,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new SchultraegerNameEindeutigError(),
            });
        });

        it('should return a domain error if Schulträger is not under a root child', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);
            organisationRepositoryMock.exists.mockResolvedValue(true);

            const oeffentlich: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.LAND,
            });
            const schultraeger: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                typ: OrganisationsTyp.TRAEGER,
                kennung: undefined,
            });

            // mock root nodes for specification
            organisationRepositoryMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisationAggregate(true, { typ: OrganisationsTyp.ROOT }),
            );
            organisationRepositoryMock.findRootDirectChildren.mockResolvedValue([oeffentlich, undefined]);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                schultraeger,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new TraegerUnterRootChildError(),
            });
        });

        it('should create a Behoerde when name is unique and administriertVon is a Land', async () => {
            organisationRepositoryMock.exists.mockResolvedValue(true);
            const land: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
            const behoerde: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: land.id,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(land);
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
            organisationRepositoryMock.save.mockResolvedValue(behoerde as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: behoerde as unknown as Organisation<true>,
            });
        });

        it('should create a Behoerde when name is unique and administriertVon is a Behoerde', async () => {
            organisationRepositoryMock.exists.mockResolvedValue(true);
            const parentBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
            });
            const behoerde: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: parentBehoerde.id,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(parentBehoerde);
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
            organisationRepositoryMock.save.mockResolvedValue(behoerde as unknown as Organisation<true>);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: behoerde as unknown as Organisation<true>,
            });
        });

        it('should return a domain error if Behoerde administriertVon is not set', async () => {
            organisationRepositoryMock.exists.mockResolvedValue(true);
            const behoerde: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: undefined,
            });

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new BehoerdeAdministriertVonError(),
            });
        });

        it('should return a domain error if Behoerde administriertVon is neither Behoerde nor Land', async () => {
            organisationRepositoryMock.exists.mockResolvedValue(true);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const behoerde: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: schule.id,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new BehoerdeAdministriertVonError(),
            });
        });

        it('should return a domain error if Behoerde name is not unique', async () => {
            organisationRepositoryMock.exists.mockResolvedValue(true);
            const land: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
            const name: string = faker.company.name();
            const behoerde: Organisation<false> = createOrganisation(false, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: land.id,
                name,
            });
            const existingBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                name,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(land);
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[existingBehoerde], 1]);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new BehoerdeNameEindeutigError(),
            });
        });
    });

    describe('updateOrganisation', () => {
        const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

        it('should preserve the stored kennung even when the input contains another kennung', async () => {
            const organisation: Organisation<true> = createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const updateData: Organisation<true> = createOrganisation(true, {
                ...organisation,
                kennung: '7654321',
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
            organisationRepositoryMock.save.mockResolvedValueOnce(organisation);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                updateData,
                permissionsMock,
            );

            expect(result).toEqual({ ok: true, value: organisation });
            expect(organisationRepositoryMock.save).toHaveBeenCalledWith(
                expect.objectContaining({ kennung: '1234567' }),
            );
        });

        const organisationUser: Organisation<true> = DoFactory.createOrganisation(true);
        const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
            {
                organisation: organisationUser,
                rolle: { systemrechte: [], serviceProviderIds: [] },
            },
        ];

        describe('when updating a Klasse without permission', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: faker.string.uuid(),
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Changed name',
                    administriertVon: faker.string.uuid(),
                };
                return { organisation, originalOrganisation, updateData };
            }

            it('should reject the update before applying changes', async () => {
                const {
                    organisation,
                    originalOrganisation,
                    updateData,
                }: {
                    organisation: Organisation<true>;
                    originalOrganisation: Organisation<true>;
                    updateData: UpdateOrganisationData;
                } = setup();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(false);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({
                    ok: false,
                    error: new MissingPermissionsError('Not authorized to manage this organisation'),
                });
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledExactlyOnceWith(
                    originalOrganisation.typ,
                    originalOrganisation.administriertVon,
                );
                expect(organisation).toEqual(originalOrganisation);
                expect(organisationRepositoryMock.exists).not.toHaveBeenCalled();
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        describe('when updating a Schule without permission', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Changed name',
                    administriertVon: faker.string.uuid(),
                };
                return { organisation, originalOrganisation, updateData };
            }

            it('should reject the update before applying changes', async () => {
                const {
                    organisation,
                    originalOrganisation,
                    updateData,
                }: {
                    organisation: Organisation<true>;
                    originalOrganisation: Organisation<true>;
                    updateData: UpdateOrganisationData;
                } = setup();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(false);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({
                    ok: false,
                    error: new MissingPermissionsError('Not authorized to manage this organisation'),
                });
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledExactlyOnceWith(
                    originalOrganisation.typ,
                    originalOrganisation.administriertVon,
                );
                expect(organisation).toEqual(originalOrganisation);
                expect(organisationRepositoryMock.exists).not.toHaveBeenCalled();
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        describe('when updating organisation fields', () => {
            function setup(): { organisation: Organisation<true>; updateData: UpdateOrganisationData } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                    kennung: 'stored-kennung',
                    updatedAt: new Date(0),
                });
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Updated name',
                    administriertVon: faker.string.uuid(),
                    namensergaenzung: 'Updated supplement',
                    kuerzel: 'UPD',
                    traegerschaft: Traegerschaft.SONSTIGE,
                    emailAdress: undefined,
                };
                return { organisation, updateData };
            }

            it('should apply update fields to the loaded organisation and retain stored metadata', async () => {
                const {
                    organisation,
                    updateData,
                }: { organisation: Organisation<true>; updateData: UpdateOrganisationData } = setup();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                organisationRepositoryMock.exists.mockResolvedValueOnce(true);
                organisationRepositoryMock.exists.mockResolvedValueOnce(true);
                organisationRepositoryMock.save.mockResolvedValueOnce(organisation);
                const beforeUpdate: number = Date.now();

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({ ok: true, value: organisation });
                expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(updateData.id);
                expect(organisationRepositoryMock.save).toHaveBeenCalledExactlyOnceWith(organisation);
                expect(organisation).toMatchObject({
                    ...updateData,
                    typ: OrganisationsTyp.SONSTIGE,
                    kennung: 'stored-kennung',
                });
                expect(organisation.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate);
            });
        });

        describe('when updating a Klasse', () => {
            function setup(schuleName: string | undefined): {
                schule: Organisation<true>;
                klasse: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    name: schuleName,
                });
                const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.KLASSE,
                    name: '1a',
                    administriertVon: schule.id,
                });
                const updateData: UpdateOrganisationData = {
                    id: klasse.id,
                    name: '1a',
                    administriertVon: schule.id,
                };
                organisationRepositoryMock.findById.mockImplementation((id: string) =>
                    Promise.resolve(id === klasse.id ? klasse : schule),
                );
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                organisationRepositoryMock.exists.mockResolvedValue(true);
                return { schule, klasse, updateData };
            }

            it('should update the Klasse when its Schule has a name', async () => {
                const { klasse, updateData }: ReturnType<typeof setup> = setup('Schule');
                organisationRepositoryMock.findChildOrgasForIds.mockResolvedValueOnce([]);
                organisationRepositoryMock.save.mockResolvedValueOnce(klasse);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({ ok: true, value: klasse });
            });

            it('should update the Klasse when its Schule has no name', async () => {
                const { klasse, updateData }: ReturnType<typeof setup> = setup(undefined);
                organisationRepositoryMock.findChildOrgasForIds.mockResolvedValueOnce([]);
                organisationRepositoryMock.save.mockResolvedValueOnce(klasse);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({ ok: true, value: klasse });
            });

            it('should return KlassenNameAnSchuleEindeutigError if another Klasse has the same name', async () => {
                const { schule, updateData }: ReturnType<typeof setup> = setup('Schule');
                const sibling: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.KLASSE,
                    name: '1a',
                    administriertVon: schule.id,
                });
                organisationRepositoryMock.findChildOrgasForIds.mockResolvedValue([sibling]);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result.ok).toBe(false);
                expect(!result.ok && result.error).toBeInstanceOf(KlassenNameAnSchuleEindeutigError);
            });
        });

        describe('when updating a Schule', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                    kennung: '1234567',
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Updated organisation',
                    administriertVon: faker.string.uuid(),
                };
                return { organisation, originalOrganisation, updateData };
            }

            it('should preserve parent reference', async () => {
                const {
                    organisation,
                    originalOrganisation,
                    updateData,
                }: {
                    organisation: Organisation<true>;
                    originalOrganisation: Organisation<true>;
                    updateData: UpdateOrganisationData;
                } = setup();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                organisationRepositoryMock.exists.mockResolvedValue(true);
                organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
                organisationRepositoryMock.save.mockResolvedValueOnce(organisation);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({ ok: true, value: organisation });
                expect(organisation.typ).toBe(OrganisationsTyp.SCHULE);
                expect(organisation.administriertVon).toBe(originalOrganisation.administriertVon);
                expect(organisation.kennung).toBe(originalOrganisation.kennung);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledExactlyOnceWith(
                    originalOrganisation.typ,
                    originalOrganisation.administriertVon,
                );
            });
        });

        describe('when updating Sonstige', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                    administriertVon: faker.string.uuid(),
                    kennung: '1234567',
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Updated organisation',
                    administriertVon: faker.string.uuid(),
                };
                return { organisation, originalOrganisation, updateData };
            }

            it('should change parent reference', async () => {
                const {
                    organisation,
                    originalOrganisation,
                    updateData,
                }: {
                    organisation: Organisation<true>;
                    originalOrganisation: Organisation<true>;
                    updateData: UpdateOrganisationData;
                } = setup();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValue(true);
                organisationRepositoryMock.exists.mockResolvedValue(true);
                organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
                organisationRepositoryMock.save.mockResolvedValueOnce(organisation);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({ ok: true, value: organisation });
                expect(organisation.typ).toBe(OrganisationsTyp.SONSTIGE);
                expect(organisation.administriertVon).toBe(updateData.administriertVon);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledExactlyOnceWith(
                    originalOrganisation.typ,
                    originalOrganisation.administriertVon,
                );
            });
        });

        describe('when an organisation administers itself', () => {
            it('should reject the update before checking references', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const organisation: Organisation<true> = createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                });
                organisation.administriertVon = organisation.id;
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    organisation,
                    permissionsMock,
                );

                expect(result).toEqual<Result<Organisation<true>>>({
                    ok: false,
                    error: new ZyklusInOrganisationenError(organisation.id),
                });
                expect(organisationRepositoryMock.exists).not.toHaveBeenCalled();
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        describe('when a descendant would administer the organisation', () => {
            it('should reject the indirect administration cycle', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const storedOrganisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                });
                const child: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                    administriertVon: storedOrganisation.id,
                });
                const organisation: Organisation<true> = createOrganisation(true, {
                    id: storedOrganisation.id,
                    typ: OrganisationsTyp.SONSTIGE,
                    administriertVon: child.id,
                });
                organisationRepositoryMock.findById
                    .mockResolvedValueOnce(storedOrganisation)
                    .mockResolvedValueOnce(child)
                    .mockResolvedValueOnce(storedOrganisation);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    organisation,
                    permissionsMock,
                );

                expect(result).toEqual<Result<Organisation<true>>>({
                    ok: false,
                    error: new ZyklusInOrganisationenError(organisation.id),
                });
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        describe('when the administering organisation does not exist', () => {
            it('should reject the update', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const organisation: Organisation<true> = createOrganisation(true);
                organisation.administriertVon = faker.string.uuid();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                organisationRepositoryMock.exists.mockResolvedValueOnce(false);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    organisation,
                    permissionsMock,
                );

                expect(result).toEqual<Result<Organisation<true>>>({
                    ok: false,
                    error: new EntityNotFoundError('Organisation', organisation.administriertVon),
                });
                expect(organisationRepositoryMock.exists).toHaveBeenCalledWith(organisation.administriertVon);
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        it('should update an organisation with existing parent reference', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const organisation: Organisation<true> = createOrganisation(true, {
                administriertVon: faker.string.uuid(),
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
            organisationRepositoryMock.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
            organisationRepositoryMock.save.mockResolvedValueOnce(organisation);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({ ok: true, value: organisation });
            expect(organisationRepositoryMock.exists).toHaveBeenNthCalledWith(1, organisation.administriertVon);
            expect(organisationRepositoryMock.save).toHaveBeenCalledWith(organisation);
        });

        it('should reject a missing update target before validating references', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.administriertVon = organisation.id;
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EntityNotFoundError('Organisation', organisation.id),
            });
            expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.exists).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
        });

        it('should update an organisation', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const organisation: Organisation<true> = createOrganisation(true);
            organisationRepositoryMock.save.mockResolvedValue(organisation);
            organisationRepositoryMock.findById.mockResolvedValue(organisation);
            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: organisation,
            });
        });

        describe('when a Behoerde is administered by a Land', () => {
            it('should update with its own unchanged name', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const parent: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
                const behoerde: Organisation<true> = createOrganisation(true, {
                    typ: OrganisationsTyp.BEHOERDE,
                    administriertVon: parent.id,
                });
                organisationRepositoryMock.findById
                    .mockResolvedValueOnce(behoerde)
                    .mockResolvedValueOnce(parent)
                    .mockResolvedValueOnce(parent);
                organisationRepositoryMock.findBy.mockResolvedValueOnce([[behoerde], 1]);
                organisationRepositoryMock.save.mockResolvedValueOnce(behoerde);
                organisationRepositoryMock.exists.mockResolvedValueOnce(true);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    behoerde,
                    permissionsMock,
                );

                expect(result).toEqual<Result<Organisation<true>>>({ ok: true, value: behoerde });
                expect(organisationRepositoryMock.save).toHaveBeenCalledWith(behoerde);
            });
        });

        describe('when a Behoerde is administered by another Behoerde', () => {
            it('should update with its own unchanged name', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const land: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
                const parent: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.BEHOERDE,
                    administriertVon: land.id,
                });
                const behoerde: Organisation<true> = createOrganisation(true, {
                    typ: OrganisationsTyp.BEHOERDE,
                    administriertVon: parent.id,
                });
                organisationRepositoryMock.findById
                    .mockResolvedValueOnce(behoerde)
                    .mockResolvedValueOnce(parent)
                    .mockResolvedValueOnce(land)
                    .mockResolvedValueOnce(parent);
                organisationRepositoryMock.findBy.mockResolvedValueOnce([[behoerde], 1]);
                organisationRepositoryMock.save.mockResolvedValueOnce(behoerde);
                organisationRepositoryMock.exists.mockResolvedValueOnce(true);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    behoerde,
                    permissionsMock,
                );

                expect(result).toEqual<Result<Organisation<true>>>({ ok: true, value: behoerde });
                expect(organisationRepositoryMock.save).toHaveBeenCalledWith(behoerde);
            });
        });

        it('should reject a Behoerde administered by itself', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const land: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
            const storedBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: land.id,
            });
            const behoerde: Organisation<true> = createOrganisation(true, {
                id: storedBehoerde.id,
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: storedBehoerde.id,
            });
            const organisations: Map<string, Organisation<true>> = new Map([
                [storedBehoerde.id, storedBehoerde],
                [land.id, land],
            ]);
            organisationRepositoryMock.findById.mockImplementation((id: string) =>
                Promise.resolve(organisations.get(id)),
            );
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
            organisationRepositoryMock.exists.mockResolvedValueOnce(true);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new ZyklusInOrganisationenError(behoerde.id),
            });
            expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
        });

        it('should reject a Behoerde administered by a descendant', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const land: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
            const storedBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: land.id,
            });
            const child: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: storedBehoerde.id,
            });
            const descendant: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: child.id,
            });
            const behoerde: Organisation<true> = createOrganisation(true, {
                id: storedBehoerde.id,
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: descendant.id,
            });
            const organisations: Map<string, Organisation<true>> = new Map([
                [storedBehoerde.id, storedBehoerde],
                [child.id, child],
                [descendant.id, descendant],
                [land.id, land],
            ]);
            organisationRepositoryMock.findById.mockImplementation((id: string) =>
                Promise.resolve(organisations.get(id)),
            );
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
            organisationRepositoryMock.exists.mockResolvedValueOnce(true);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new ZyklusInOrganisationenError(behoerde.id),
            });
            expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
        });

        it('should reject updating a Behoerde administered by a Schule', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const behoerde: Organisation<true> = createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: schule.id,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(behoerde).mockResolvedValueOnce(schule);
            organisationRepositoryMock.exists.mockResolvedValueOnce(true);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                behoerde,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new BehoerdeAdministriertVonError(behoerde.id),
            });
            expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
        });

        it('should reject changing an organisation to a Behoerde with a duplicate name', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const land: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
            const organisation: Organisation<true> = createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                administriertVon: land.id,
            });
            const existingBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                name: organisation.name,
            });
            organisationRepositoryMock.findById
                .mockResolvedValueOnce(organisation)
                .mockResolvedValueOnce(land)
                .mockResolvedValueOnce(land);
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[existingBehoerde], 1]);
            organisation.typ = OrganisationsTyp.BEHOERDE;
            organisationRepositoryMock.exists.mockResolvedValueOnce(true);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new BehoerdeNameEindeutigError(organisation.id),
            });
            expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
        });

        it('should update a Schule and log the update', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const schule: Organisation<true> = DoFactory.createOrganisation(true);
            schule.typ = OrganisationsTyp.SCHULE;
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findBy.mockResolvedValueOnce([[], 0]);
            organisationRepositoryMock.save.mockResolvedValue(schule);
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                schule,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: schule,
            });
        });

        it('should update a Klasse and log the update', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const schule: Organisation<true> = DoFactory.createOrganisation(true);
            const klasse: Organisation<true> = createOrganisation(true);
            schule.typ = OrganisationsTyp.SCHULE;
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.administriertVon = schule.id;
            organisationRepositoryMock.findById.mockResolvedValueOnce(klasse);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.findChildOrgasForIds.mockResolvedValueOnce([]);
            organisationRepositoryMock.save.mockResolvedValue(klasse);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                klasse,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: klasse,
            });
        });

        it('should fail to update a Klasse and log the update attempt', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const schule: Organisation<true> = DoFactory.createOrganisation(true);
            const klasse: Organisation<true> = createOrganisation(true);
            klasse.typ = OrganisationsTyp.KLASSE;
            organisationRepositoryMock.findById.mockResolvedValueOnce(klasse);
            organisationRepositoryMock.save.mockResolvedValue(klasse);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);
            organisationRepositoryMock.exists.mockResolvedValueOnce(true);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                klasse,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KlasseNurVonSchuleAdministriertError(klasse.id),
            });
        });

        it('should return a domain error', async () => {
            const organisation: Organisation<true> = createOrganisation(true);
            organisation.id = '';
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValue(organisation);
            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EntityCouldNotBeUpdated(`Organization could not be updated`, organisation.id),
            });
        });

        it('should return a domain error if kennung is not set and type is schule', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                kennung: undefined,
            });
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationUser);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KennungRequiredForSchuleError(),
            });
        });

        it('should return a domain error if name is not set and type is schule', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);

            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                kennung: '1234567',
                name: undefined,
            });
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValue(organisation);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new NameRequiredForSchuleError(),
            });
        });

        it('should return a domain error if type is klasse and email is set', async () => {
            const organisation: Organisation<true> = createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                emailAdress: 'klassenmail123@spsh.de',
                name: 'Klasse123',
            });
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValue(organisation);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EmailAdressOnOrganisationTypError(),
            });
        });

        it('should return a domain error if kennung is not unique and type is schule', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);

            const name: string = faker.string.alpha();
            const kennung: string = faker.string.numeric({ length: 7 });
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                kennung: kennung,
                name: name,
            });
            const otherOrganisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                kennung: kennung,
                name: faker.string.alpha(),
            });
            const counted: Counted<Organisation<true>> = [[otherOrganisation], 1];
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValue(organisation);
            organisationRepositoryMock.findBy.mockResolvedValueOnce(counted);
            organisationRepositoryMock.save.mockResolvedValue(organisation);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new SchuleKennungEindeutigError(),
            });
        });

        it('should update the organisation if kennung is unique except for itself', async () => {
            permissionsMock.getPersonenkontexteWithRolesAndOrgs.mockResolvedValue(personenkontextewithRolesMock);
            organisationRepositoryMock.findById.mockResolvedValue(organisationUser);

            const name: string = faker.string.alpha();
            const kennung: string = faker.string.numeric({ length: 7 });
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                kennung: kennung,
                name: name,
            });
            // findBy returns the organisation itself (same id), e.g. because kennung was unchanged
            const counted: Counted<Organisation<true>> = [[organisation], 1];
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValue(organisation);
            organisationRepositoryMock.findBy.mockResolvedValueOnce(counted);
            organisationRepositoryMock.save.mockResolvedValue(organisation);

            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: organisation,
            });
        });

        it('should return a domain error when organisation cannot be found on update', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisationRepositoryMock.findById.mockResolvedValue(undefined);
            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisation,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EntityNotFoundError('Organisation', organisation.id),
            });
        });

        it('should return domain error if name contains trailing space', async () => {
            const organisationDo: Organisation<true> = createOrganisation(true, { name: '  ' });
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisationDo,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new NameForOrganisationWithTrailingSpaceError(),
            });
        });

        it('should return domain error if kennung contains trailing space', async () => {
            const organisationDo: Organisation<true> = createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                kennung: 'kennung ',
            });
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationDo);
            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisationDo,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KennungForOrganisationWithTrailingSpaceError(),
            });
        });

        it('should return domain error if name contains trailing space', async () => {
            const organisationDo: Organisation<true> = createOrganisation(true, { name: '  ' });
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisationDo,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new NameForOrganisationWithTrailingSpaceError(),
            });
        });

        it('should return domain error if kennung contains trailing space', async () => {
            const organisationDo: Organisation<true> = createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                kennung: 'kennung ',
            });
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationDo);
            const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                organisationDo,
                permissionsMock,
            );
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KennungForOrganisationWithTrailingSpaceError(),
            });
        });
    });

    describe('findOrganisationById', () => {
        it('should find an organization by its ID', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisationRepositoryMock.findById.mockResolvedValue(organisation);
            const result: Result<Organisation<true>> = await organisationService.findOrganisationById(organisation.id);
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: true,
                value: organisation,
            });
        });

        it('should return a domain error', async () => {
            organisationRepositoryMock.findById.mockResolvedValue(null);
            const organisationId: string = faker.string.uuid();
            const result: Result<Organisation<true>> = await organisationService.findOrganisationById(organisationId);
            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EntityNotFoundError('Organization', organisationId),
            });
        });
    });

    describe('findAllAdministriertVon', () => {
        describe('when organizations are found', () => {
            it('should return all organizations', async () => {
                const parentId: string = faker.string.uuid();
                const organisation: Organisation<true> = DoFactory.createOrganisation(true);
                const organisations: Organisation<true>[] = [organisation];
                const total: number = organisations.length;

                organisationRepositoryMock.findBy.mockResolvedValue([organisations, total]);

                const result: Paged<Organisation<true>> = await organisationService.findAllAdministriertVon(parentId);

                expect(result).toEqual({
                    total: total,
                    offset: 0,
                    limit: total,
                    items: organisations,
                    pageTotal: total,
                });
            });
        });

        describe('when no organizations are found', () => {
            it('should return an empty list of organizations', async () => {
                const parentId: string = faker.string.uuid();
                organisationRepositoryMock.findBy.mockResolvedValue([[], 0]);

                const result: Paged<Organisation<true>> = await organisationService.findAllAdministriertVon(parentId);

                expect(result.items).toHaveLength(0);
                expect(result.items).toBeInstanceOf(Array);
            });
        });
    });

    describe('findOrganisationByIdAndMatchingPermissions', () => {
        it('should include BEHOERDEN_VERWALTEN in the authorized lookup and return a permitted Behoerde', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
            });
            organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
            permissionsMock.hasSystemrechtAtOrganisation.mockImplementation(
                (organisationId: string, systemrecht: RollenSystemRecht): Promise<boolean> =>
                    Promise.resolve(
                        organisationId === organisation.id && systemrecht === RollenSystemRecht.BEHOERDEN_VERWALTEN,
                    ),
            );

            const result: Result<
                Organisation<true>,
                DomainError
            > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                permissionsMock,
                organisation.id,
            );

            expect(organisationRepositoryMock.findAuthorized).toHaveBeenCalledWith(
                permissionsMock,
                [
                    RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
                    RollenSystemRecht.SCHULEN_VERWALTEN,
                    RollenSystemRecht.KLASSEN_VERWALTEN,
                    RollenSystemRecht.BEHOERDEN_VERWALTEN,
                ],
                { organisationIds: [organisation.id], limit: 1, matchAllSystemrechte: false },
            );
            expect(result).toEqual({ ok: true, value: organisation });
        });

        it('should return an error, if orga can not be found', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findAuthorized.mockResolvedValue([[], 0, 0]);
            const result: Result<
                Organisation<true>,
                DomainError
            > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                permissionsMock,
                faker.string.uuid(),
            );
            expect(result.ok).toBeFalsy();
            expect(!result.ok && result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return an error, if wrong orga is found', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findAuthorized.mockResolvedValue([[DoFactory.createOrganisation(true)], 1, 1]);
            const result: Result<
                Organisation<true>,
                DomainError
            > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                permissionsMock,
                faker.string.uuid(),
            );
            expect(result.ok).toBeFalsy();
            expect(!result.ok && result.error).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return an error, if orga has no type', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            const mockOrganisation: Organisation<true> = DoFactory.createOrganisation(true, { typ: undefined });
            organisationRepositoryMock.findAuthorized.mockResolvedValue([[mockOrganisation], 1, 1]);
            const result: Result<
                Organisation<true>,
                DomainError
            > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                permissionsMock,
                mockOrganisation.id,
            );
            expect(result.ok).toBeFalsy();
            expect(!result.ok && result.error).toBeInstanceOf(MissingPermissionsError);
        });

        it('should return an error, if permissions are not defined for OrganisationsTyp', async () => {
            const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);
            const mockOrganisation: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.ROOT,
            });
            organisationRepositoryMock.findAuthorized.mockResolvedValue([[mockOrganisation], 1, 1]);
            const result: Result<
                Organisation<true>,
                DomainError
            > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                permissionsMock,
                mockOrganisation.id,
            );
            expect(result.ok).toBeFalsy();
            expect(!result.ok && result.error).toBeInstanceOf(MissingPermissionsError);
        });

        describe('when the organisation is a Schultraeger', () => {
            it('should check SCHULTRAEGER_VERWALTEN', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.TRAEGER,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

                await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
                );
            });

            it('should return an error if SCHULTRAEGER_VERWALTEN is missing', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.TRAEGER,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);

                const result: Result<
                    Organisation<true>,
                    DomainError
                > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(result.ok).toBeFalsy();
                expect(!result.ok && result.error).toBeInstanceOf(MissingPermissionsError);
                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
                );
            });
        });

        describe('when the organisation is a Schule', () => {
            it('should check SCHULEN_VERWALTEN', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

                await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.SCHULEN_VERWALTEN,
                );
            });

            it('should return an error if SCHULEN_VERWALTEN is missing', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);

                const result: Result<
                    Organisation<true>,
                    DomainError
                > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(result.ok).toBeFalsy();
                expect(!result.ok && result.error).toBeInstanceOf(MissingPermissionsError);
                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.SCHULEN_VERWALTEN,
                );
            });
        });

        describe('when the organisation is a Klasse', () => {
            it('should check KLASSEN_VERWALTEN', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.KLASSE,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

                await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.KLASSEN_VERWALTEN,
                );
            });

            it('should return an error if KLASSEN_VERWALTEN is missing', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.KLASSE,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);

                const result: Result<
                    Organisation<true>,
                    DomainError
                > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(result.ok).toBeFalsy();
                expect(!result.ok && result.error).toBeInstanceOf(MissingPermissionsError);
                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.KLASSEN_VERWALTEN,
                );
            });
        });

        describe('when the organisation is a Behoerde', () => {
            it('should check BEHOERDEN_VERWALTEN', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.BEHOERDE,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

                await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.BEHOERDEN_VERWALTEN,
                );
            });

            it('should return an error if BEHOERDEN_VERWALTEN is missing', async () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.BEHOERDE,
                });
                organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(false);

                const result: Result<
                    Organisation<true>,
                    DomainError
                > = await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                    permissionsMock,
                    organisation.id,
                );

                expect(result.ok).toBeFalsy();
                expect(!result.ok && result.error).toBeInstanceOf(MissingPermissionsError);
                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledExactlyOnceWith(
                    organisation.id,
                    RollenSystemRecht.BEHOERDEN_VERWALTEN,
                );
            });
        });
    });

    describe('findOrganisationsbeziehungen', () => {
        const organisationId: OrganisationID = faker.string.uuid();

        it('should return EntityNotFoundError if the organisation does not exist', async () => {
            organisationRepositoryMock.exists.mockResolvedValueOnce(false);

            const result: Result<
                Paged<OrganisationsbeziehungWithOrganisationen>,
                DomainError
            > = await organisationService.findOrganisationsbeziehungen(organisationId, {});

            expect(result).toEqual({ ok: false, error: new EntityNotFoundError('Organisation', organisationId) });
            expect(organisationRepositoryMock.findOrganisationsbeziehungen).not.toHaveBeenCalled();
        });

        it('should return the paged relationships without requiring permissions', async () => {
            const item: OrganisationsbeziehungWithOrganisationen = {
                organisationsbeziehung: {
                    id: faker.string.uuid(),
                    createdAt: faker.date.past(),
                    updatedAt: faker.date.recent(),
                    quellOrganisationId: organisationId,
                    zielOrganisationId: faker.string.uuid(),
                    typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
                },
                quelle: DoFactory.createOrganisation(true),
                ziel: DoFactory.createOrganisation(true),
            };
            organisationRepositoryMock.exists.mockResolvedValueOnce(true);
            organisationRepositoryMock.findOrganisationsbeziehungen.mockResolvedValueOnce([[item], 5]);

            const result: Result<
                Paged<OrganisationsbeziehungWithOrganisationen>,
                DomainError
            > = await organisationService.findOrganisationsbeziehungen(organisationId, { offset: 2, limit: 1 });

            expect(organisationRepositoryMock.findOrganisationsbeziehungen).toHaveBeenCalledWith(organisationId, {
                offset: 2,
                limit: 1,
            });
            expect(result).toEqual({
                ok: true,
                value: { total: 5, offset: 2, limit: 1, items: [item], pageTotal: 1 },
            });
        });

        it('should default offset to 0 and limit to total', async () => {
            organisationRepositoryMock.exists.mockResolvedValueOnce(true);
            organisationRepositoryMock.findOrganisationsbeziehungen.mockResolvedValueOnce([[], 0]);

            const result: Result<
                Paged<OrganisationsbeziehungWithOrganisationen>,
                DomainError
            > = await organisationService.findOrganisationsbeziehungen(organisationId, {});

            expect(result).toEqual({
                ok: true,
                value: { total: 0, offset: 0, limit: 0, items: [], pageTotal: 0 },
            });
        });
    });

    describe('searchOrganisationsForRelationships', () => {
        it('should require permission to manage the source organisation', async () => {
            const organisationId: OrganisationID = faker.string.uuid();
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

            const result: Result<
                Paged<Organisation<true>>,
                DomainError
            > = await organisationService.searchOrganisationsForRelationships(organisationId, {}, permissions);

            expect(result).toEqual({ ok: false, error: new EntityNotFoundError('Organisation', organisationId) });
            expect(organisationRepositoryMock.findAuthorized).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.findOrganisationsbeziehungen).not.toHaveBeenCalled();
        });

        it('should reject an existing source organisation when manage permission is denied', async () => {
            const source: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findById.mockResolvedValueOnce(source);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(false);

            const result: Result<
                Paged<Organisation<true>>,
                DomainError
            > = await organisationService.searchOrganisationsForRelationships(source.id, {}, permissions);

            expect(result).toEqual({
                ok: false,
                error: new MissingPermissionsError('Not permitted to manage organisation'),
            });
            expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                source.id,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(organisationRepositoryMock.findOrganisationsbeziehungen).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.findAuthorized).not.toHaveBeenCalled();
        });

        it('should search manageable Behörden and exclude existing relationships before pagination', async () => {
            const source: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const linkedFromSource: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
            });
            const linkedToSource: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
            });
            const eligible: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
            });
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findById.mockResolvedValueOnce(source);
            const subtreeRootId: OrganisationID = faker.string.uuid();
            organisationRepositoryMock.findOrganisationSubtreeRootId.mockResolvedValueOnce(subtreeRootId);
            organisationRepositoryMock.findAuthorized.mockResolvedValueOnce([[eligible], 9, 1]);
            organisationRepositoryMock.findRelatedOrganisationIds.mockResolvedValueOnce([
                linkedFromSource.id,
                linkedToSource.id,
            ]);

            const result: Result<
                Paged<Organisation<true>>,
                DomainError
            > = await organisationService.searchOrganisationsForRelationships(
                source.id,
                { searchString: 'Behörde', offset: 5, limit: 2 },
                permissions,
            );

            expect(organisationRepositoryMock.findAuthorized).toHaveBeenCalledWith(
                permissions,
                [RollenSystemRecht.BEHOERDEN_VERWALTEN],
                {
                    typ: OrganisationsTyp.BEHOERDE,
                    searchString: 'Behörde',
                    offset: 5,
                    limit: 2,
                    administriertVon: [subtreeRootId],
                    getChildrenRecursively: true,
                    excludeOrganisationIds: [linkedFromSource.id, linkedToSource.id, source.id],
                },
            );
            expect(result).toEqual({
                ok: true,
                value: { total: 9, offset: 5, limit: 2, items: [eligible], pageTotal: 1 },
            });
        });

        it.each([OrganisationsTyp.BEHOERDE, OrganisationsTyp.TRAEGER])(
            'should search manageable Schulen for a %s',
            async (typ: OrganisationsTyp) => {
                const source: Organisation<true> = DoFactory.createOrganisation(true, { typ });
                const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                organisationRepositoryMock.findById.mockResolvedValueOnce(source);
                const subtreeRootId: OrganisationID = faker.string.uuid();
                organisationRepositoryMock.findOrganisationSubtreeRootId.mockResolvedValueOnce(subtreeRootId);
                organisationRepositoryMock.findAuthorized.mockResolvedValueOnce([[schule], 1, 1]);
                organisationRepositoryMock.findRelatedOrganisationIds.mockResolvedValueOnce([]);

                const result: Result<
                    Paged<Organisation<true>>,
                    DomainError
                > = await organisationService.searchOrganisationsForRelationships(source.id, {}, permissions);

                expect(organisationRepositoryMock.findAuthorized).toHaveBeenCalledWith(
                    permissions,
                    [RollenSystemRecht.SCHULEN_VERWALTEN],
                    {
                        typ: OrganisationsTyp.SCHULE,
                        searchString: undefined,
                        offset: undefined,
                        limit: undefined,
                        administriertVon: [subtreeRootId],
                        getChildrenRecursively: true,
                        excludeOrganisationIds: [source.id],
                        ...(typ === OrganisationsTyp.TRAEGER
                            ? { excludeSchoolsWithSchultraegerRelationship: true }
                            : {}),
                    },
                );
                expect(result).toMatchObject({ ok: true, value: { items: [schule], total: 1 } });
            },
        );

        it('should reject relationship searches for unsupported organisation types', async () => {
            const source: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE });
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findById.mockResolvedValueOnce(source);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: Result<
                Paged<Organisation<true>>,
                DomainError
            > = await organisationService.searchOrganisationsForRelationships(source.id, { offset: 4 }, permissions);

            expect(result).toEqual({
                ok: false,
                error: new RelationshipSearchUnsupportedOrganisationTypeError(source.id, OrganisationsTyp.KLASSE),
            });
            expect(organisationRepositoryMock.findAuthorized).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.findRelatedOrganisationIds).not.toHaveBeenCalled();
        });

        it('should return an empty page when a supported organisation type has no candidates', async () => {
            const source: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findById.mockResolvedValueOnce(source);
            organisationRepositoryMock.findOrganisationSubtreeRootId.mockResolvedValueOnce(faker.string.uuid());
            organisationRepositoryMock.findRelatedOrganisationIds.mockResolvedValueOnce([]);
            organisationRepositoryMock.findAuthorized.mockResolvedValueOnce([[], 0, 0]);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: Result<
                Paged<Organisation<true>>,
                DomainError
            > = await organisationService.searchOrganisationsForRelationships(source.id, {}, permissions);

            expect(result).toEqual({
                ok: true,
                value: { total: 0, offset: 0, limit: 0, items: [], pageTotal: 0 },
            });
        });

        it('should only search authorities the school administrator may manage', async () => {
            const source: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findById.mockResolvedValueOnce(source);
            organisationRepositoryMock.findOrganisationSubtreeRootId.mockResolvedValueOnce(faker.string.uuid());
            organisationRepositoryMock.findRelatedOrganisationIds.mockResolvedValueOnce([]);
            organisationRepositoryMock.findAuthorized.mockResolvedValueOnce([[], 0, 0]);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            const result: Result<
                Paged<Organisation<true>>,
                DomainError
            > = await organisationService.searchOrganisationsForRelationships(source.id, {}, permissions);

            expect(permissions.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                source.id,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(organisationRepositoryMock.findAuthorized).toHaveBeenCalledWith(
                permissions,
                [RollenSystemRecht.BEHOERDEN_VERWALTEN],
                expect.objectContaining({ typ: OrganisationsTyp.BEHOERDE }),
            );
            expect(result).toMatchObject({ ok: true, value: { items: [], total: 0 } });
        });
    });

    describe('createOrganisationsbeziehung', () => {
        const quellOrganisationId: OrganisationID = faker.string.uuid();
        const zielOrganisationId: OrganisationID = faker.string.uuid();
        const typ: OrganisationsbeziehungsTyp = OrganisationsbeziehungsTyp.SCHULTRAEGER;
        const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

        let zielOrganisation: Organisation<true, false>;
        let quellOrganisationWithRelationships: Organisation<true, true>;
        let persistedOrganisationsbeziehung: Organisationsbeziehung<true>;

        beforeEach(() => {
            zielOrganisation = DoFactory.createOrganisation(true, {
                id: zielOrganisationId,
                typ: OrganisationsTyp.TRAEGER,
            });

            persistedOrganisationsbeziehung = {
                id: faker.string.uuid(),
                createdAt: faker.date.past(),
                updatedAt: faker.date.recent(),
                quellOrganisationId,
                zielOrganisationId,
                typ,
            };

            quellOrganisationWithRelationships = createOrganisation<true, true>(
                true,
                {
                    id: quellOrganisationId,
                    typ: OrganisationsTyp.SCHULE,
                },
                [],
            );

            organisationRepositoryMock.findByIdWithRelationships.mockResolvedValue(quellOrganisationWithRelationships);
            organisationRepositoryMock.findById.mockResolvedValue(zielOrganisation);
            organisationRepositoryMock.createOrganisationsbeziehung.mockResolvedValue(persistedOrganisationsbeziehung);

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);

            vi.spyOn(SchulaufsichtQuelleSchuleZielBehoerde.prototype, 'isSatisfiedBy').mockResolvedValue(true);
            vi.spyOn(SchulaufsichtSchuleUndAufsichtSelberBaum.prototype, 'isSatisfiedBy').mockResolvedValue(true);
            vi.spyOn(SchultraegerQuelleSchuleZielTraeger.prototype, 'isSatisfiedBy').mockResolvedValue(true);
            vi.spyOn(SchultraegerSchuleHatExaktEinenTraeger.prototype, 'isSatisfiedBy').mockResolvedValue(true);
            vi.spyOn(SchultraegerSchuleUndTraegerSelberBaum.prototype, 'isSatisfiedBy').mockResolvedValue(true);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should create an Organisationsbeziehung when source and target may be managed', async () => {
            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result).toEqual({
                ok: true,
                value: persistedOrganisationsbeziehung,
            });
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(zielOrganisationId);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                1,
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                2,
                zielOrganisationId,
                RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
            );
            expect(organisationRepositoryMock.createOrganisationsbeziehung).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.createOrganisationsbeziehung).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: undefined,
                    createdAt: undefined,
                    updatedAt: undefined,
                    quellOrganisationId,
                    zielOrganisationId,
                    typ,
                }),
            );
            expect(quellOrganisationWithRelationships.organisationsbeziehungen).toContainEqual(
                expect.objectContaining({
                    quellOrganisationId,
                    zielOrganisationId,
                    typ,
                }),
            );
        });

        it('should return EntityNotFoundError when the source organisation does not exist', async () => {
            organisationRepositoryMock.findByIdWithRelationships.mockResolvedValueOnce(undefined);

            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.createOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the source organisation type has no manage permission', async () => {
            quellOrganisationWithRelationships.typ = OrganisationsTyp.LAND;

            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.createOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the source organisation may not be managed', async () => {
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.createOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError when the target organisation does not exist', async () => {
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);

            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(zielOrganisationId);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(organisationRepositoryMock.createOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the target organisation type has no manage permission', async () => {
            zielOrganisation.typ = OrganisationsTyp.LAND;

            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(organisationRepositoryMock.createOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the target organisation may not be managed', async () => {
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                1,
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                2,
                zielOrganisationId,
                RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
            );
            expect(organisationRepositoryMock.findById).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.createOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it.each([
            [OrganisationsTyp.KLASSE, RollenSystemRecht.KLASSEN_VERWALTEN],
            [OrganisationsTyp.BEHOERDE, RollenSystemRecht.BEHOERDEN_VERWALTEN],
        ])(
            'should check the correct manage permission for source organisation type %s',
            async (organisationsTyp: OrganisationsTyp, expectedSystemrecht: RollenSystemRecht) => {
                quellOrganisationWithRelationships.typ = organisationsTyp;

                const result: Result<
                    Organisationsbeziehung<true>,
                    DomainError
                > = await organisationService.createOrganisationsbeziehung(
                    quellOrganisationId,
                    zielOrganisationId,
                    typ,
                    permissionsMock,
                );

                expect(result.ok).toBe(true);
                expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                    1,
                    quellOrganisationId,
                    expectedSystemrecht,
                );
            },
        );

        it('should return EntityCouldNotBeCreated when persistence fails', async () => {
            organisationRepositoryMock.createOrganisationsbeziehung.mockRejectedValueOnce(new Error('Database error'));

            const result: Result<
                Organisationsbeziehung<true>,
                DomainError
            > = await organisationService.createOrganisationsbeziehung(
                quellOrganisationId,
                zielOrganisationId,
                typ,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityCouldNotBeCreated);
            }
            expect(organisationRepositoryMock.createOrganisationsbeziehung).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.createOrganisationsbeziehung).toHaveBeenCalledWith(
                expect.objectContaining({
                    quellOrganisationId,
                    zielOrganisationId,
                    typ,
                }),
            );
        });
        describe('validateSpecificationsForOrganisationsbeziehung', () => {
            async function createBeziehungAndExpectError(
                expectedError: new (organisationsbeziehungId?: string) => DomainError,
                beziehungsTyp: OrganisationsbeziehungsTyp = typ,
            ): Promise<void> {
                const result: Result<
                    Organisationsbeziehung<true>,
                    DomainError
                > = await organisationService.createOrganisationsbeziehung(
                    quellOrganisationId,
                    zielOrganisationId,
                    beziehungsTyp,
                    permissionsMock,
                );

                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(expectedError);
                }
                expect(organisationRepositoryMock.createOrganisationsbeziehung).not.toHaveBeenCalled();
            }

            it('should return SchulaufsichtQuelleSchuleZielBehoerdeError when SchulaufsichtQuelleSchuleZielBehoerde is not satisfied', async () => {
                vi.spyOn(SchulaufsichtQuelleSchuleZielBehoerde.prototype, 'isSatisfiedBy').mockResolvedValue(false);

                await createBeziehungAndExpectError(
                    SchulaufsichtQuelleSchuleZielBehoerdeError,
                    OrganisationsbeziehungsTyp.SCHULAUFSICHT,
                );
            });

            it('should return SchulaufsichtSchuleUndAufsichtSelberBaumError when SchulaufsichtSchuleUndAufsichtSelberBaum is not satisfied', async () => {
                vi.spyOn(SchulaufsichtSchuleUndAufsichtSelberBaum.prototype, 'isSatisfiedBy').mockResolvedValue(false);

                await createBeziehungAndExpectError(
                    SchulaufsichtSchuleUndAufsichtSelberBaumError,
                    OrganisationsbeziehungsTyp.SCHULAUFSICHT,
                );
            });

            it('should return SchultraegerQuelleSchuleZielTraegerError when SchultraegerQuelleSchuleZielTraeger is not satisfied', async () => {
                vi.spyOn(SchultraegerQuelleSchuleZielTraeger.prototype, 'isSatisfiedBy').mockResolvedValue(false);

                await createBeziehungAndExpectError(SchultraegerQuelleSchuleZielTraegerError);
            });

            it('should return SchultraegerSchuleHatExaktEinenTraegerError when SchultraegerSchuleHatExaktEinenTraeger is not satisfied', async () => {
                vi.spyOn(SchultraegerSchuleHatExaktEinenTraeger.prototype, 'isSatisfiedBy').mockResolvedValue(false);

                await createBeziehungAndExpectError(SchultraegerSchuleHatExaktEinenTraegerError);
            });

            it('should return SchultraegerSchuleUndTraegerSelberBaumError when SchultraegerSchuleUndTraegerSelberBaum is not satisfied', async () => {
                vi.spyOn(SchultraegerSchuleUndTraegerSelberBaum.prototype, 'isSatisfiedBy').mockResolvedValue(false);

                await createBeziehungAndExpectError(SchultraegerSchuleUndTraegerSelberBaumError);
            });

            it.each([
                [
                    OrganisationsbeziehungsTyp.SCHULAUFSICHT,
                    [SchulaufsichtQuelleSchuleZielBehoerde, SchulaufsichtSchuleUndAufsichtSelberBaum],
                    [
                        SchultraegerQuelleSchuleZielTraeger,
                        SchultraegerSchuleHatExaktEinenTraeger,
                        SchultraegerSchuleUndTraegerSelberBaum,
                    ],
                ],
                [
                    OrganisationsbeziehungsTyp.SCHULTRAEGER,
                    [
                        SchultraegerQuelleSchuleZielTraeger,
                        SchultraegerSchuleHatExaktEinenTraeger,
                        SchultraegerSchuleUndTraegerSelberBaum,
                    ],
                    [SchulaufsichtQuelleSchuleZielBehoerde, SchulaufsichtSchuleUndAufsichtSelberBaum],
                ],
            ])(
                'should only check the specifications matching type %s',
                async (
                    beziehungsTyp: OrganisationsbeziehungsTyp,
                    checked: { prototype: { isSatisfiedBy: unknown } }[],
                    notChecked: { prototype: { isSatisfiedBy: unknown } }[],
                ) => {
                    const checkedSpies: MockInstance[] = checked.map((c: { prototype: object }) =>
                        vi.spyOn(c.prototype as { isSatisfiedBy: () => Promise<boolean> }, 'isSatisfiedBy'),
                    );
                    const notCheckedSpies: MockInstance[] = notChecked.map((c: { prototype: object }) =>
                        vi.spyOn(c.prototype as { isSatisfiedBy: () => Promise<boolean> }, 'isSatisfiedBy'),
                    );

                    await organisationService.createOrganisationsbeziehung(
                        quellOrganisationId,
                        zielOrganisationId,
                        beziehungsTyp,
                        permissionsMock,
                    );

                    for (const spy of checkedSpies) {
                        expect(spy).toHaveBeenCalledTimes(1);
                        expect(spy).toHaveBeenCalledWith(
                            expect.objectContaining({
                                id: undefined,
                                quellOrganisationId,
                                zielOrganisationId,
                                typ: beziehungsTyp,
                            }),
                        );
                    }
                    for (const spy of notCheckedSpies) {
                        expect(spy).not.toHaveBeenCalled();
                    }
                },
            );
        });
    });

    describe('deleteOrganisationsbeziehung', () => {
        const organisationsbeziehungId: string = faker.string.uuid();
        const quellOrganisationId: OrganisationID = faker.string.uuid();
        const zielOrganisationId: OrganisationID = faker.string.uuid();
        const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

        let organisationsbeziehung: Organisationsbeziehung<true>;
        let zielOrganisation: Organisation<true, false>;
        let quellOrganisationWithRelationships: Organisation<true, true>;

        beforeEach(() => {
            organisationsbeziehung = {
                id: organisationsbeziehungId,
                createdAt: faker.date.past(),
                updatedAt: faker.date.recent(),
                quellOrganisationId,
                zielOrganisationId,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            };

            zielOrganisation = DoFactory.createOrganisation(true, {
                id: zielOrganisationId,
                typ: OrganisationsTyp.TRAEGER,
            });

            quellOrganisationWithRelationships = createOrganisation<true, true>(
                true,
                {
                    id: quellOrganisationId,
                    typ: OrganisationsTyp.SCHULE,
                },
                [organisationsbeziehung],
            );

            organisationRepositoryMock.findOrganisationsbeziehungById.mockResolvedValue(organisationsbeziehung);
            organisationRepositoryMock.findByIdWithRelationships.mockResolvedValue(quellOrganisationWithRelationships);
            organisationRepositoryMock.findById.mockResolvedValue(zielOrganisation);
            organisationRepositoryMock.deleteOrganisationsbeziehung.mockResolvedValue(undefined);

            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
        });

        it('should delete an Organisationsbeziehung when source and target may be managed', async () => {
            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result).toEqual({
                ok: true,
                value: undefined,
            });
            expect(organisationRepositoryMock.findOrganisationsbeziehungById).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findOrganisationsbeziehungById).toHaveBeenCalledWith(
                organisationsbeziehungId,
            );
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(zielOrganisationId);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                1,
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                2,
                zielOrganisationId,
                RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
            );
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).toHaveBeenCalledWith(
                organisationsbeziehungId,
            );
            expect(quellOrganisationWithRelationships.organisationsbeziehungen).not.toContainEqual(
                organisationsbeziehung,
            );
        });

        it('should return EntityNotFoundError when the Organisationsbeziehung does not exist', async () => {
            organisationRepositoryMock.findOrganisationsbeziehungById.mockResolvedValueOnce(undefined);

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError when the source organisation does not exist', async () => {
            organisationRepositoryMock.findByIdWithRelationships.mockResolvedValueOnce(undefined);

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the source organisation type has no manage permission', async () => {
            quellOrganisationWithRelationships.typ = OrganisationsTyp.LAND;

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(permissionsMock.hasSystemrechtAtOrganisation).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the source organisation may not be managed', async () => {
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(organisationRepositoryMock.findById).not.toHaveBeenCalled();
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError when the target organisation does not exist', async () => {
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(zielOrganisationId);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the target organisation type has no manage permission', async () => {
            zielOrganisation.typ = OrganisationsTyp.LAND;

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return MissingPermissionsError when the target organisation may not be managed', async () => {
            permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MissingPermissionsError);
            }
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                1,
                quellOrganisationId,
                RollenSystemRecht.SCHULEN_VERWALTEN,
            );
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenNthCalledWith(
                2,
                zielOrganisationId,
                RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
            );
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
        });

        it('should return EntityNotFoundError when the Organisationsbeziehung is not part of the source organisation', async () => {
            const sourceWithoutRelationship: Organisation<true, true> = createOrganisation<true, true>(
                true,
                {
                    id: quellOrganisationId,
                    typ: OrganisationsTyp.SCHULE,
                },
                [],
            );

            organisationRepositoryMock.findByIdWithRelationships.mockResolvedValueOnce(sourceWithoutRelationship);

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(zielOrganisationId);
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).not.toHaveBeenCalled();
            expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(2);
        });

        it('should return EntityCouldNotBeUpdated when deletion fails', async () => {
            organisationRepositoryMock.deleteOrganisationsbeziehung.mockRejectedValueOnce(new Error('Database error'));

            const result: Result<void, DomainError> = await organisationService.deleteOrganisationsbeziehung(
                organisationsbeziehungId,
                permissionsMock,
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(EntityCouldNotBeUpdated);
            }
            expect(organisationRepositoryMock.findByIdWithRelationships).toHaveBeenCalledWith(quellOrganisationId);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(zielOrganisationId);
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).toHaveBeenCalledTimes(1);
            expect(organisationRepositoryMock.deleteOrganisationsbeziehung).toHaveBeenCalledWith(
                organisationsbeziehungId,
            );
        });
    });
});
