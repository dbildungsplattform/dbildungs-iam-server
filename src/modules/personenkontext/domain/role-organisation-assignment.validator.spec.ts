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
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;
    let organisationMock: DeepMocked<Organisation<true>>;
    let rolleMock: DeepMocked<Rolle<true>>;
    let sut: RoleOrganisationAssignmentValidator;

    beforeEach(() => {
        rolleRepoMock = createMock(RolleRepo);
        organisationRepositoryMock = createMock(OrganisationRepository);
        organisationMock = createMock(Organisation<true>) as unknown as DeepMocked<Organisation<true>>;
        rolleMock = createMock(Rolle<true>) as unknown as DeepMocked<Rolle<true>>;
        sut = new RoleOrganisationAssignmentValidator(rolleRepoMock, organisationRepositoryMock);
    });

    describe('checkReferences', () => {
        it('should return EntityNotFoundError for Organisation if organisation does not exist', async () => {
            // Arrange
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);

            // Act
            const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

            // Assert
            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            expect(result.error).toEqual(new EntityNotFoundError('Organisation', organisationId));
        });

        it('should return EntityNotFoundError for Rolle if rolle does not exist', async () => {
            // Arrange
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
            rolleRepoMock.findById.mockResolvedValueOnce(undefined);

            // Act
            const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

            // Assert
            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
            expect(result.error).toEqual(new EntityNotFoundError('Rolle', rolleId));
        });

        it('should report missing Organisation first if both organisation and rolle do not exist', async () => {
            // Arrange
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            organisationRepositoryMock.findById.mockResolvedValueOnce(undefined);
            rolleRepoMock.findById.mockResolvedValueOnce(undefined);

            // Act
            const result: Result<void, DomainError> = await sut.checkReferences(organisationId, rolleId);

            // Assert
            expectErrResult(result);
            expect(result.error).toEqual(new EntityNotFoundError('Organisation', organisationId));
        });

        it('should look up organisation and rolle by their ids', async () => {
            // Arrange
            const organisationId: string = faker.string.uuid();
            const rolleId: string = faker.string.uuid();
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Ok(undefined));

            // Act
            await sut.checkReferences(organisationId, rolleId);

            // Assert
            expect(organisationRepositoryMock.findById).toHaveBeenCalledWith(organisationId);
            expect(rolleRepoMock.findById).toHaveBeenCalledWith(rolleId);
            expect(rolleMock.canBeAssignedToOrga).toHaveBeenCalledWith(organisationMock);
        });

        it('should return Ok if rolle can be assigned to organisation', async () => {
            // Arrange
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Ok(undefined));

            // Act
            const result: Result<void, DomainError> = await sut.checkReferences(
                faker.string.uuid(),
                faker.string.uuid(),
            );

            // Assert
            expectOkResult(result);
        });

        it('should return RolleNurAnPassendeOrganisationError if rollenart does not match organisation', async () => {
            // Arrange
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Err(new OrganisationMatchesRollenartError()));

            // Act
            const result: Result<void, DomainError> = await sut.checkReferences(
                faker.string.uuid(),
                faker.string.uuid(),
            );

            // Assert
            expectErrResult(result);
            expect(result.error).toBeInstanceOf(RolleNurAnPassendeOrganisationError);
        });

        it('should return EntityNotFoundError for Rolle if rolle is not available for organisation', async () => {
            // Arrange
            const rolleId: string = faker.string.uuid();
            organisationRepositoryMock.findById.mockResolvedValueOnce(organisationMock);
            rolleRepoMock.findById.mockResolvedValueOnce(rolleMock);
            rolleMock.canBeAssignedToOrga.mockResolvedValueOnce(Err(new EntityNotFoundError('Rolle', rolleId)));

            // Act
            const result: Result<void, DomainError> = await sut.checkReferences(faker.string.uuid(), rolleId);

            // Assert
            expectErrResult(result);
            expect(result.error).toEqual(new EntityNotFoundError('Rolle', rolleId));
        });
    });
});
