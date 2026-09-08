import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { createPersonPermissionsMock, PersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { EntityCouldNotBeCreated } from '../../../shared/error/entity-could-not-be-created.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { DomainError, EntityCouldNotBeUpdated, MissingPermissionsError } from '../../../shared/error/index.js';
import { Paged } from '../../../shared/paging/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import {
    PersonenkontextRolleWithOrganisation,
    PersonPermissions,
} from '../../authentication/domain/person-permissions.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
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
import { OrganisationZuordnungVerschiebenError } from './organisation-zuordnung-verschieben.error.js';
import { OrganisationsTyp, RootDirectChildrenType } from './organisation.enums.js';
import { Organisation } from './organisation.js';
import { OrganisationService } from './organisation.service.js';

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
        it('should update an organisation', async () => {
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

        it('should update a Schule and log the update', async () => {
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
            const schule: Organisation<true> = DoFactory.createOrganisation(true);
            const klasse: Organisation<true> = DoFactory.createOrganisation(true);
            klasse.typ = OrganisationsTyp.KLASSE;
            klasse.zugehoerigZu = schule.id;
            organisationRepositoryMock.findById.mockResolvedValueOnce(klasse);
            organisationRepositoryMock.save.mockResolvedValue(klasse);
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule);

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
            organisationRepositoryMock.findById.mockResolvedValue({} as Option<Organisation<true>>);
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
            const counted: Counted<Organisation<true>> = [[organisation], 1];
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
            organisationRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
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
            organisationRepositoryMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
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

        describe.each([
            {
                organisation: DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
                expectedSystemrecht: RollenSystemRecht.SCHULTRAEGER_VERWALTEN,
            },
            {
                organisation: DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
                expectedSystemrecht: RollenSystemRecht.SCHULEN_VERWALTEN,
            },
            {
                organisation: DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE }),
                expectedSystemrecht: RollenSystemRecht.KLASSEN_VERWALTEN,
            },
        ])(
            'with organisation of type $organisation.typ',
            ({
                organisation,
                expectedSystemrecht,
            }: {
                organisation: Organisation<true>;
                expectedSystemrecht: RollenSystemRecht;
            }) => {
                it(`it should use ${expectedSystemrecht.name} for permissions check`, async () => {
                    organisationRepositoryMock.findAuthorized.mockResolvedValue([[organisation], 1, 1]);
                    const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                    permissionsMock.hasSystemrechtAtOrganisation.mockResolvedValue(true);
                    await organisationService.findOrganisationByIdAndAnyMatchingPermissions(
                        permissionsMock,
                        organisation.id,
                    );
                    expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
                    expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                        organisation.id,
                        expectedSystemrecht,
                    );
                });

                it('should return an error, if permissions are missing', async () => {
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
                    expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledTimes(1);
                    expect(permissionsMock.hasSystemrechtAtOrganisation).toHaveBeenCalledWith(
                        organisation.id,
                        expectedSystemrecht,
                    );
                });
            },
        );
    });
});
