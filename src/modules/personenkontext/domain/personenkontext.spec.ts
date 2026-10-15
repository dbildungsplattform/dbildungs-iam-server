import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';
import { type MockedObject } from 'vitest';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonenkontextFactory } from './personenkontext.factory.js';
import { type Personenkontext } from './personenkontext.js';

describe('Personenkontext aggregate', () => {
    let module: TestingModule;

    let personenkontextFactory: PersonenkontextFactory;
    let personRepoMock: DeepMocked<PersonRepository>;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let rolleRepoMock: DeepMocked<RolleRepo>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonenkontextFactory,
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
            ],
        }).compile();

        personenkontextFactory = module.get(PersonenkontextFactory);
        personRepoMock = module.get(PersonRepository);
        organisationRepoMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('checkReferences', () => {
        it('should check if all references exist', async () => {
            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            await personenkontext.checkReferences();

            expect(personRepoMock.exists).toHaveBeenCalledWith(personenkontext.personId);
            expect(organisationRepoMock.findById).toHaveBeenCalledWith(personenkontext.organisationId);
            expect(rolleRepoMock.findById).toHaveBeenCalledWith(personenkontext.rolleId);
        });

        it('should return no error if all references are valid', async () => {
            personRepoMock.exists.mockResolvedValueOnce(true);
            const orga: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            organisationRepoMock.findById.mockResolvedValueOnce(orga);
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEIT,
                administeredBySchulstrukturknoten: orga.id,
            });
            rolleRepoMock.findById.mockResolvedValueOnce(rolle);

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                orga.id,
                rolle.id,
            );

            const result: Option<DomainError> = await personenkontext.checkReferences();

            expect(result).toBeUndefined();
        });

        it('should return EntityNotFoundError if person does not exist', async () => {
            personRepoMock.exists.mockResolvedValueOnce(false);
            organisationRepoMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
            rolleRepoMock.findById.mockResolvedValueOnce(DoFactory.createRolle(true));

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            const result: Option<DomainError> = await personenkontext.checkReferences();

            expect(result).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return EntityNotFoundError if organisation does not exist', async () => {
            personRepoMock.exists.mockResolvedValueOnce(true);
            organisationRepoMock.findById.mockResolvedValueOnce(undefined);
            rolleRepoMock.findById.mockResolvedValueOnce(DoFactory.createRolle(true));

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            const result: Option<DomainError> = await personenkontext.checkReferences();

            expect(result).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return EntityNotFoundError if rolle does not exist', async () => {
            personRepoMock.exists.mockResolvedValueOnce(true);
            organisationRepoMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
            rolleRepoMock.findById.mockResolvedValueOnce(undefined);

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            const result: Option<DomainError> = await personenkontext.checkReferences();

            expect(result).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return EntityNotFoundError if rolle can not be assigned to orga', async () => {
            personRepoMock.exists.mockResolvedValueOnce(true);
            organisationRepoMock.findById.mockResolvedValueOnce(DoFactory.createOrganisation(true));
            const rolleMock: MockedObject<Rolle<true>> = vi.mockObject<Rolle<true>>(DoFactory.createRolle(true));
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Err(new EntityNotFoundError('Rolle', rolleMock.id)));

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            const result: Option<DomainError> = await personenkontext.checkReferences();

            expect(result).toBeInstanceOf(EntityNotFoundError);
        });

        it('should return PersonenkontextAnlageError if rolle does not match orga', async () => {
            personRepoMock.exists.mockResolvedValueOnce(true);
            const orgaMock: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            organisationRepoMock.findById.mockResolvedValueOnce(orgaMock);
            const rolleMock: MockedObject<Rolle<true>> = vi.mockObject<Rolle<true>>(
                DoFactory.createRolle(true, { rollenart: RollenArt.SYSADMIN }),
            );
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Err(new OrganisationMatchesRollenartError()));

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            const result: Option<DomainError> = await personenkontext.checkReferences();

            expect(result).toBeInstanceOf(OrganisationMatchesRollenartError);
        });
    });

    describe('checkPermissions', () => {
        it('should return MissingPermissionsError, if logged in user is not authorized at organisation', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechteAtOrganisation.mockResolvedValueOnce(false); // Check orga permissions

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            await expect(personenkontext.checkPermissions(permissions)).resolves.toEqual(
                new MissingPermissionsError('Unauthorized to manage persons at the organisation'),
            );

            expect(permissions.hasSystemrechteAtOrganisation).toHaveBeenCalledWith(personenkontext.organisationId, [
                RollenSystemRecht.PERSONEN_VERWALTEN,
            ]);
        });

        it('should return MissingPermissionsError, if target person can not be modified by logged in user', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechteAtOrganisation.mockResolvedValueOnce(true); // Check orga permissions
            const rolleMock: MockedObject<Rolle<true>> = vi.mockObject<Rolle<true>>(DoFactory.createRolle(true));
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Ok(undefined)); // Check rolle<->orga validity
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            permissions.canModifyPerson.mockResolvedValueOnce(false); // Check person permissions

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            await expect(personenkontext.checkPermissions(permissions)).resolves.toEqual(
                new MissingPermissionsError('Not authorized to manage this person'),
            );
        });

        it('should not return an error, if kontext is valid', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.hasSystemrechteAtOrganisation.mockResolvedValueOnce(true); // Check orga permissions
            const rolleMock: MockedObject<Rolle<true>> = vi.mockObject<Rolle<true>>(DoFactory.createRolle(true));
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Ok(undefined)); // Check rolle<->orga validity
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            permissions.canModifyPerson.mockResolvedValueOnce(true); // Check person permissions

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            await expect(personenkontext.checkPermissions(permissions)).resolves.toBeUndefined();
        });
    });

    describe('getOrganisation', () => {
        it('should return the Organisation', async () => {
            const orgaMock: Organisation<true> = DoFactory.createOrganisation(true);
            organisationRepoMock.findById.mockResolvedValueOnce(orgaMock);

            const personenkontext: Personenkontext<false> = personenkontextFactory.createNew(
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );

            const result: Option<Organisation<true>> = await personenkontext.getOrganisation();

            expect(result).toBe(orgaMock);
        });
    });
});
