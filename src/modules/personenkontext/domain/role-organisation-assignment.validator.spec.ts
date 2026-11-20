import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RolleNurAnPassendeOrganisationError } from '../specification/error/rolle-nur-an-passende-organisation.js';
import { RoleOrganisationAssignmentValidator } from './role-organisation-assignment.validator.js';

describe('RoleOrganisationAssignmentValidator', () => {
    describe('checkReferences', () => {
        describe('if organisation does not exist', () => {
            function setup(): {
                sut: RoleOrganisationAssignmentValidator;
                organisationId: string;
                rolleId: string;
            } {
                const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
                const organisationRepositoryMock: DeepMocked<OrganisationRepository> =
                    createMock(OrganisationRepository);
                const rolleMock: DeepMocked<Rolle<true>> = createMock<Rolle<true>>(Rolle);
                organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);
                rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);

                return {
                    sut: new RoleOrganisationAssignmentValidator(rolleRepoMock, organisationRepositoryMock),
                    organisationId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                };
            }

            it('should return EntityNotFoundError for Organisation', async () => {
                // Arrange
                const { sut, organisationId, rolleId }: ReturnType<typeof setup> = setup();

                // Act
                const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

                // Assert
                expectErrResult(result);
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
                expect(result.error).toEqual(new EntityNotFoundError('Organisation', organisationId));
            });
        });

        describe('if rolle does not exist', () => {
            function setup(): {
                sut: RoleOrganisationAssignmentValidator;
                organisationId: string;
                rolleId: string;
            } {
                const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
                const organisationRepositoryMock: DeepMocked<OrganisationRepository> =
                    createMock(OrganisationRepository);
                const organisationMock: DeepMocked<Organisation<true>> = createMock<Organisation<true>>(Organisation);
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
                rolleRepoMock.findById.mockResolvedValueOnce(undefined);

                return {
                    sut: new RoleOrganisationAssignmentValidator(rolleRepoMock, organisationRepositoryMock),
                    organisationId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                };
            }

            it('should return EntityNotFoundError for Rolle', async () => {
                // Arrange
                const { sut, organisationId, rolleId }: ReturnType<typeof setup> = setup();

                // Act
                const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

                // Assert
                expectErrResult(result);
                expect(result.error).toBeInstanceOf(EntityNotFoundError);
                expect(result.error).toEqual(new EntityNotFoundError('Rolle', rolleId));
            });
        });

        describe('if both organisation and rolle do not exist', () => {
            function setup(): {
                sut: RoleOrganisationAssignmentValidator;
                organisationId: string;
                rolleId: string;
            } {
                const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
                const organisationRepositoryMock: DeepMocked<OrganisationRepository> =
                    createMock(OrganisationRepository);
                organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);
                rolleRepoMock.findById.mockResolvedValueOnce(undefined);

                return {
                    sut: new RoleOrganisationAssignmentValidator(rolleRepoMock, organisationRepositoryMock),
                    organisationId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                };
            }

            it('should report missing Organisation first', async () => {
                // Arrange
                const { sut, organisationId, rolleId }: ReturnType<typeof setup> = setup();

                // Act
                const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

                // Assert
                expectErrResult(result);
                expect(result.error).toEqual(new EntityNotFoundError('Organisation', organisationId));
            });
        });

        describe('if rolle can be assigned to organisation', () => {
            function setup(): {
                sut: RoleOrganisationAssignmentValidator;
                organisationId: string;
                rolleId: string;
                rolleRepoMock: DeepMocked<RolleRepo>;
                organisationRepositoryMock: DeepMocked<OrganisationRepository>;
                organisationMock: DeepMocked<Organisation<true>>;
                rolleMock: DeepMocked<Rolle<true>>;
            } {
                const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
                const organisationRepositoryMock: DeepMocked<OrganisationRepository> =
                    createMock(OrganisationRepository);
                const organisationMock: DeepMocked<Organisation<true>> = createMock<Organisation<true>>(Organisation);
                const rolleMock: DeepMocked<Rolle<true>> = createMock<Rolle<true>>(Rolle);
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
                rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
                rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Ok(undefined));

                return {
                    sut: new RoleOrganisationAssignmentValidator(rolleRepoMock, organisationRepositoryMock),
                    organisationId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                    rolleRepoMock,
                    organisationRepositoryMock,
                    organisationMock,
                    rolleMock,
                };
            }

            it('should look up organisation and rolle by their ids', async () => {
                // Arrange
                const {
                    sut,
                    organisationId,
                    rolleId,
                    organisationRepositoryMock,
                    rolleRepoMock,
                    rolleMock,
                    organisationMock,
                }: ReturnType<typeof setup> = setup();

                // Act
                await sut.checkReferences(organisationId, rolleId);

                // Assert
                expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(organisationId);
                expect(rolleRepoMock.findById).toHaveBeenCalledWith(rolleId);
                expect(rolleMock.canBeAssignedToOrga).toHaveBeenCalledWith(organisationMock);
            });

            it('should return Ok', async () => {
                // Arrange
                const { sut, organisationId, rolleId }: ReturnType<typeof setup> = setup();

                // Act
                const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

                // Assert
                expectOkResult(result);
            });
        });

        describe('if rollenart does not match organisation', () => {
            function setup(): {
                sut: RoleOrganisationAssignmentValidator;
                organisationId: string;
                rolleId: string;
            } {
                const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
                const organisationRepositoryMock: DeepMocked<OrganisationRepository> =
                    createMock(OrganisationRepository);
                const organisationMock: DeepMocked<Organisation<true>> = createMock<Organisation<true>>(Organisation);
                const rolleMock: DeepMocked<Rolle<true>> = createMock<Rolle<true>>(Rolle);
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
                rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
                rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Err(new OrganisationMatchesRollenartError()));

                return {
                    sut: new RoleOrganisationAssignmentValidator(rolleRepoMock, organisationRepositoryMock),
                    organisationId: faker.string.uuid(),
                    rolleId: faker.string.uuid(),
                };
            }

            it('should return RolleNurAnPassendeOrganisationError', async () => {
                // Arrange
                const { sut, organisationId, rolleId }: ReturnType<typeof setup> = setup();

                // Act
                const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

                // Assert
                expectErrResult(result);
                expect(result.error).toBeInstanceOf(RolleNurAnPassendeOrganisationError);
            });
        });

        describe('if rolle is not available for organisation', () => {
            function setup(): {
                sut: RoleOrganisationAssignmentValidator;
                organisationId: string;
                rolleId: string;
            } {
                const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
                const organisationRepositoryMock: DeepMocked<OrganisationRepository> =
                    createMock(OrganisationRepository);
                const organisationMock: DeepMocked<Organisation<true>> = createMock<Organisation<true>>(Organisation);
                const rolleMock: DeepMocked<Rolle<true>> = createMock<Rolle<true>>(Rolle);
                const rolleId: string = faker.string.uuid();
                organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
                rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
                rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Err(new EntityNotFoundError('Rolle', rolleId)));

                return {
                    sut: new RoleOrganisationAssignmentValidator(rolleRepoMock, organisationRepositoryMock),
                    organisationId: faker.string.uuid(),
                    rolleId,
                };
            }

            it('should return EntityNotFoundError for Rolle', async () => {
                // Arrange
                const { sut, organisationId, rolleId }: ReturnType<typeof setup> = setup();

                // Act
                const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

                // Assert
                expectErrResult(result);
                expect(result.error).toEqual(new EntityNotFoundError('Rolle', rolleId));
            });
        });
    });
});
