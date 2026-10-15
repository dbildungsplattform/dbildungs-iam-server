import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';
import { createPersonPermissionsMock, PersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { EntityCouldNotBeCreated } from '../../../shared/error/entity-could-not-be-created.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { type DomainError, EntityCouldNotBeUpdated, MissingPermissionsError } from '../../../shared/error/index.js';
import { type Paged } from '../../../shared/paging/index.js';
import { type IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import {
    type PersonenkontextRolleWithOrganisation,
    type PersonPermissions,
} from '../../authentication/domain/person-permissions.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { BehoerdeAdministriertVonError } from '../specification/error/behoerde-administriert-von.error.js';
import { BehoerdeNameEindeutigError } from '../specification/error/behoerde-name-eindeutig.error.js';
import { EmailAdressOnOrganisationTypError } from '../specification/error/email-adress-on-organisation-typ-error.js';
import { KennungRequiredForSchuleError } from '../specification/error/kennung-required-for-schule.error.js';
import { KennungForOrganisationWithTrailingSpaceError } from '../specification/error/kennung-with-trailing-space.error.js';
import { KlasseNurVonSchuleAdministriertError } from '../specification/error/klasse-nur-von-schule-administriert.error.js';
import { KlasseWithoutNumberOrLetterError } from '../specification/error/klasse-without-number-or-letter.error.js';
import { NameRequiredForSchuleError } from '../specification/error/name-required-for-schule.error.js';
import { NameForOrganisationWithTrailingSpaceError } from '../specification/error/name-with-trailing-space.error.js';
import { OrganisationsOnDifferentSubtreesError } from '../specification/error/organisations-on-different-subtrees.error.js';
import { SchuleKennungEindeutigError } from '../specification/error/schule-kennung-eindeutig.error.js';
import { SchuleUnterTraegerError } from '../specification/error/schule-unter-traeger.error.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerUnterRootChildError } from '../specification/error/traeger-unter-root-child.error.js';
import { ZyklusInOrganisationenError } from '../specification/error/zyklus-in-organisationen.error.js';
import { OrganisationZuordnungVerschiebenError } from './organisation-zuordnung-verschieben.error.js';
import { OrganisationsTyp, RootDirectChildrenType, Traegerschaft } from './organisation.enums.js';
import { type Organisation } from './organisation.js';
import { OrganisationService, type UpdateOrganisationData } from './organisation.service.js';

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
        const organisationUser: Organisation<true> = DoFactory.createOrganisation(true);
        const personenkontextewithRolesMock: PersonenkontextRolleWithOrganisation[] = [
            {
                organisation: organisationUser,
                rolle: { systemrechte: [], serviceProviderIds: [] },
            },
        ];

        it('should create an organisation', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false);
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
            const klasse: Organisation<false> = DoFactory.createOrganisation(false);
            schule.typ = OrganisationsTyp.SCHULE;
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.administriertVon = schule.id;
            klasse.zugehoerigZu = schule.id;
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
            const klasse: Organisation<false> = DoFactory.createOrganisation(false);
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.zugehoerigZu = schule.id;
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

        it('should return a domain error if first parent organisation does not exist', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false);
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

        it('should return a domain error if second parent organisation does not exist', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false);
            organisation.zugehoerigZu = faker.string.uuid();
            organisationRepositoryMock.exists.mockResolvedValueOnce(false);

            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                organisation,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new EntityNotFoundError('Organisation', organisation.zugehoerigZu),
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
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
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
            const organisation: Organisation<false> = DoFactory.createOrganisation(false);
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
            const organisationDo: Organisation<false> = DoFactory.createOrganisation(false, { name: ' name' });
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
            const organisationDo: Organisation<false> = DoFactory.createOrganisation(false, { kennung: ' ' });
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
            const organisationDo: Organisation<false> = DoFactory.createOrganisation(false, {
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
                zugehoerigZu: ersatz.id,
            });
            const schultraeger: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.TRAEGER,
                name,
                zugehoerigZu: oeffentlich.id,
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
            const schultraeger: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.TRAEGER,
                name: name,
                zugehoerigZu: oeffentlich.id,
            });

            const existingSchultraeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                name: name,
                zugehoerigZu: oeffentlich.id,
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
            const behoerde: Organisation<false> = DoFactory.createOrganisation(false, {
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
            const behoerde: Organisation<false> = DoFactory.createOrganisation(false, {
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
            const behoerde: Organisation<false> = DoFactory.createOrganisation(false, {
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
            const behoerde: Organisation<false> = DoFactory.createOrganisation(false, {
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
            const behoerde: Organisation<false> = DoFactory.createOrganisation(false, {
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
                    typ: OrganisationsTyp.SONSTIGE,
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
                    typ: OrganisationsTyp.SONSTIGE,
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
                    typ: OrganisationsTyp.SONSTIGE,
                    name: 'Updated name',
                    administriertVon: faker.string.uuid(),
                    zugehoerigZu: faker.string.uuid(),
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
                expect(organisation).toMatchObject({ ...updateData, kennung: 'stored-kennung' });
                expect(organisation.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate);
            });
        });

        describe('when updating a Schule to a Schule', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                    zugehoerigZu: faker.string.uuid(),
                    kennung: '1234567',
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Updated organisation',
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                    zugehoerigZu: faker.string.uuid(),
                };
                return { organisation, originalOrganisation, updateData };
            }

            it('should preserve both parent references', async () => {
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
                expect(organisation.administriertVon).toBe(originalOrganisation.administriertVon);
                expect(organisation.zugehoerigZu).toBe(originalOrganisation.zugehoerigZu);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledExactlyOnceWith(
                    originalOrganisation.typ,
                    originalOrganisation.administriertVon,
                );
            });
        });

        describe('when updating a Schule to Sonstige', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                    zugehoerigZu: faker.string.uuid(),
                    kennung: '1234567',
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Updated organisation',
                    typ: OrganisationsTyp.SONSTIGE,
                    administriertVon: faker.string.uuid(),
                    zugehoerigZu: faker.string.uuid(),
                };
                return { organisation, originalOrganisation, updateData };
            }

            it('should change both parent references', async () => {
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
                organisationRepositoryMock.save.mockResolvedValueOnce(organisation);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({ ok: true, value: organisation });
                expect(organisation.administriertVon).toBe(updateData.administriertVon);
                expect(organisation.zugehoerigZu).toBe(updateData.zugehoerigZu);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledTimes(2);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenNthCalledWith(
                    1,
                    originalOrganisation.typ,
                    originalOrganisation.administriertVon,
                );
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenNthCalledWith(
                    2,
                    updateData.typ,
                    updateData.administriertVon,
                );
            });
        });

        describe('when updating Sonstige to a Schule', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                    administriertVon: faker.string.uuid(),
                    zugehoerigZu: faker.string.uuid(),
                    kennung: '1234567',
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    id: organisation.id,
                    name: 'Updated organisation',
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                    zugehoerigZu: faker.string.uuid(),
                };
                return { organisation, originalOrganisation, updateData };
            }

            it('should change both parent references', async () => {
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
                expect(organisation.administriertVon).toBe(updateData.administriertVon);
                expect(organisation.zugehoerigZu).toBe(updateData.zugehoerigZu);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledTimes(2);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenNthCalledWith(
                    1,
                    originalOrganisation.typ,
                    originalOrganisation.administriertVon,
                );
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenNthCalledWith(
                    2,
                    updateData.typ,
                    updateData.administriertVon,
                );
            });
        });

        describe('when moving a Klasse without destination permission', () => {
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
                    ...organisation,
                    administriertVon: faker.string.uuid(),
                };
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
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

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({
                    ok: false,
                    error: new MissingPermissionsError('Not authorized to manage this organisation'),
                });
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledTimes(2);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenNthCalledWith(
                    2,
                    updateData.typ,
                    updateData.administriertVon,
                );
                expect(organisation).toEqual(originalOrganisation);
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        describe('when moving a Behoerde without destination permission', () => {
            function setup(): {
                organisation: Organisation<true>;
                originalOrganisation: Organisation<true>;
                updateData: UpdateOrganisationData;
            } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.BEHOERDE,
                    administriertVon: faker.string.uuid(),
                });
                const originalOrganisation: Organisation<true> = DoFactory.createOrganisation(true, organisation);
                const updateData: UpdateOrganisationData = {
                    ...organisation,
                    administriertVon: faker.string.uuid(),
                };
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
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

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({
                    ok: false,
                    error: new MissingPermissionsError('Not authorized to manage this organisation'),
                });
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledTimes(2);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenNthCalledWith(
                    2,
                    updateData.typ,
                    updateData.administriertVon,
                );
                expect(organisation).toEqual(originalOrganisation);
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        describe('when changing only the organisation type without destination permission', () => {
            function setup(): { organisation: Organisation<true>; updateData: UpdateOrganisationData } {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: faker.string.uuid(),
                });
                const updateData: UpdateOrganisationData = { ...organisation, typ: OrganisationsTyp.SONSTIGE };
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
                return { organisation, updateData };
            }

            it('should reject the update before applying changes', async () => {
                const {
                    organisation,
                    updateData,
                }: { organisation: Organisation<true>; updateData: UpdateOrganisationData } = setup();

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    updateData,
                    permissionsMock,
                );

                expect(result).toEqual({
                    ok: false,
                    error: new MissingPermissionsError('Not authorized to manage this organisation'),
                });
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenCalledTimes(2);
                expect(permissionsMock.hasOrgVerwaltenRechtAtOrga).toHaveBeenNthCalledWith(
                    2,
                    updateData.typ,
                    updateData.administriertVon,
                );
                expect(organisation.typ).toBe(OrganisationsTyp.SCHULE);
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        describe('when an organisation administers itself', () => {
            it('should reject the update before checking references', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
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

        describe('when an organisation belongs to itself', () => {
            it('should reject the update before checking references', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                });
                organisation.zugehoerigZu = organisation.id;
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
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const storedOrganisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                });
                const child: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                    administriertVon: storedOrganisation.id,
                });
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
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

        describe('when the organisation would belong to a descendant', () => {
            it('should reject the indirect membership cycle', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const storedOrganisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                });
                const child: Organisation<true> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.SONSTIGE,
                    zugehoerigZu: storedOrganisation.id,
                });
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                    id: storedOrganisation.id,
                    typ: OrganisationsTyp.SONSTIGE,
                    zugehoerigZu: child.id,
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
                const organisation: Organisation<true> = DoFactory.createOrganisation(true);
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

        describe('when the organisation to belong to does not exist', () => {
            it('should reject the update', async () => {
                permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
                const organisation: Organisation<true> = DoFactory.createOrganisation(true);
                organisation.zugehoerigZu = faker.string.uuid();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisation);
                organisationRepositoryMock.exists.mockResolvedValueOnce(false);

                const result: Result<Organisation<true>> = await organisationService.updateOrganisation(
                    organisation,
                    permissionsMock,
                );

                expect(result).toEqual<Result<Organisation<true>>>({
                    ok: false,
                    error: new EntityNotFoundError('Organisation', organisation.zugehoerigZu),
                });
                expect(organisationRepositoryMock.exists).toHaveBeenCalledWith(organisation.zugehoerigZu);
                expect(organisationRepositoryMock.save).not.toHaveBeenCalled();
            });
        });

        it('should update an organisation with existing parent references', async () => {
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                administriertVon: faker.string.uuid(),
                zugehoerigZu: faker.string.uuid(),
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
            expect(organisationRepositoryMock.exists).toHaveBeenNthCalledWith(2, organisation.zugehoerigZu);
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
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
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
                const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
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
                const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
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
            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);
            const land: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.LAND });
            const storedBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: land.id,
            });
            const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
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
            const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
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
            const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
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
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
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
            const klasse: Organisation<true> = DoFactory.createOrganisation(true);
            schule.typ = OrganisationsTyp.SCHULE;
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.administriertVon = schule.id;
            klasse.zugehoerigZu = schule.id;
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
            const klasse: Organisation<true> = DoFactory.createOrganisation(true);
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.zugehoerigZu = schule.id;
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
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
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
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
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
            const organisationDo: Organisation<true> = DoFactory.createOrganisation(true, { name: '  ' });
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
            const organisationDo: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'kennung ' });
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
            const organisationDo: Organisation<true> = DoFactory.createOrganisation(true, { name: '  ' });
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
            const organisationDo: Organisation<true> = DoFactory.createOrganisation(true, { kennung: 'kennung ' });
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

    describe('setZugehoerigZu', () => {
        it('should return a domain error if the child organisation does not exist', async () => {
            const parentId: string = faker.string.uuid();
            const childId: string = faker.string.uuid();
            const permissions: IPersonPermissions = new PersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(new Map());

            const result: Result<void> = await organisationService.setZugehoerigZu(parentId, childId, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new EntityNotFoundError('Organisation', childId),
            });
        });

        it('should return a domain error if the child organisation does not have a parent', async () => {
            const parentId: string = faker.string.uuid();
            const childId: string = faker.string.uuid();
            const permissions: IPersonPermissions = new PersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(
                new Map([[childId, DoFactory.createOrganisation(true, { id: childId, zugehoerigZu: undefined })]]),
            );

            const result: Result<void> = await organisationService.setZugehoerigZu(parentId, childId, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new EntityNotFoundError('Organisation', childId),
            });
        });

        it('should return a domain error if the parent organisation does not exist', async () => {
            const parentId: string = faker.string.uuid();
            const childId: string = faker.string.uuid();
            const permissions: IPersonPermissions = new PersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [childId, DoFactory.createOrganisation(true, { id: childId, zugehoerigZu: faker.string.uuid() })],
                ]),
            );

            const result: Result<void> = await organisationService.setZugehoerigZu(parentId, childId, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new EntityNotFoundError('Organisation', parentId),
            });
        });

        it("should return a domain error if the user doesn't have permissions for both parents", async () => {
            const parentId: string = faker.string.uuid();
            const childId: string = faker.string.uuid();
            const permissions: DeepMocked<IPersonPermissions> = createPersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [childId, DoFactory.createOrganisation(true, { id: childId, zugehoerigZu: faker.string.uuid() })],
                    [parentId, DoFactory.createOrganisation(true, { id: parentId })],
                ]),
            );
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(true);
            permissions.hasSystemrechtAtOrganisation.mockResolvedValueOnce(false);

            const result: Result<void> = await organisationService.setZugehoerigZu(parentId, childId, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new MissingPermissionsError('Not allowed to edit organisations'),
            });
        });

        it('should return a domain error if the child organisation is not a school', async () => {
            const parentId: string = faker.string.uuid();
            const childId: string = faker.string.uuid();
            const permissions: IPersonPermissions = new PersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [
                        childId,
                        DoFactory.createOrganisation(true, {
                            id: childId,
                            typ: OrganisationsTyp.TRAEGER,
                            zugehoerigZu: faker.string.uuid(),
                        }),
                    ],
                    [parentId, DoFactory.createOrganisation(true, { id: parentId })],
                ]),
            );

            const result: Result<void> = await organisationService.setZugehoerigZu(parentId, childId, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new OrganisationZuordnungVerschiebenError(childId, OrganisationsTyp.TRAEGER),
            });
        });

        it('should return a domain error if the child organisation would change subtrees', async () => {
            const school: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                zugehoerigZu: faker.string.uuid(),
            });
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                zugehoerigZu: faker.string.uuid(),
            });

            const permissions: IPersonPermissions = new PersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [school.id, school],
                    [traeger.id, traeger],
                ]),
            );

            organisationRepositoryMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.ERSATZ,
            ); // OrganisationOnSameSubtree
            organisationRepositoryMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            ); // OrganisationOnSameSubtree

            const result: Result<void> = await organisationService.setZugehoerigZu(traeger.id, school.id, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new OrganisationsOnDifferentSubtreesError(),
            });
        });

        it('should return a domain error if the child organisation could not be updated', async () => {
            const school: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                administriertVon: faker.string.uuid(),
                zugehoerigZu: faker.string.uuid(),
            });
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                zugehoerigZu: faker.string.uuid(),
            });

            const permissions: IPersonPermissions = new PersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [school.id, school],
                    [traeger.id, traeger],
                ]),
            );

            organisationRepositoryMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            ); // OrganisationOnSameSubtree
            organisationRepositoryMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            ); // OrganisationOnSameSubtree
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined); // SchuleUnterTraeger

            const result: Result<void> = await organisationService.setZugehoerigZu(traeger.id, school.id, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new SchuleUnterTraegerError(school.id),
            });
        });

        it('should return a domain error if the organisation could not be saved', async () => {
            const oeffentlich: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            });
            const school: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                administriertVon: faker.string.uuid(),
                zugehoerigZu: faker.string.uuid(),
            });
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                zugehoerigZu: faker.string.uuid(),
            });

            const permissions: IPersonPermissions = new PersonPermissionsMock();
            organisationRepositoryMock.findByIds.mockResolvedValueOnce(
                new Map([
                    [school.id, school],
                    [traeger.id, traeger],
                ]),
            );

            organisationRepositoryMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            ); // OrganisationOnSameSubtree
            organisationRepositoryMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValueOnce(
                RootDirectChildrenType.OEFFENTLICH,
            ); // OrganisationOnSameSubtree
            organisationRepositoryMock.findById.mockResolvedValueOnce(oeffentlich); // SchuleUnterTraeger
            organisationRepositoryMock.findById.mockResolvedValueOnce(oeffentlich); // SchuleUnterTraeger
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined); // ZyklusInOrganisationen
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined); // ZyklusInOrganisationen

            organisationRepositoryMock.save.mockRejectedValueOnce(new Error());

            const result: Result<void> = await organisationService.setZugehoerigZu(traeger.id, school.id, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new EntityCouldNotBeUpdated('Organisation', school.id),
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

    describe('findAllZugehoerigZu', () => {
        describe('when organizations are found', () => {
            it('should return all organizations', async () => {
                const parentId: string = faker.string.uuid();
                const organisation: Organisation<true> = DoFactory.createOrganisation(true);
                const organisations: Organisation<true>[] = [organisation];
                const total: number = organisations.length;

                organisationRepositoryMock.findBy.mockResolvedValue([organisations, total]);

                const result: Paged<Organisation<true>> = await organisationService.findAllZugehoerigZu(parentId);

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

                const result: Paged<Organisation<true>> = await organisationService.findAllZugehoerigZu(parentId);

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
});
