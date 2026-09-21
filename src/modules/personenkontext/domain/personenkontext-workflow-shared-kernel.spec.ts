import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RolleNurAnPassendeOrganisationError } from '../specification/error/rolle-nur-an-passende-organisation.js';
import { PersonenkontextWorkflowSharedKernel } from './personenkontext-workflow-shared-kernel.js';

describe('PersonenkontextWorkflowSharedKernel', () => {
    let module: TestingModule;

    let sut: PersonenkontextWorkflowSharedKernel;

    const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
    const organisationRepoMock: DeepMocked<OrganisationRepository> = createMock(OrganisationRepository);

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonenkontextWorkflowSharedKernel,
                { provide: RolleRepo, useValue: rolleRepoMock },
                { provide: OrganisationRepository, useValue: organisationRepoMock },
            ],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        sut = new PersonenkontextWorkflowSharedKernel(rolleRepoMock, organisationRepoMock);
    });

    describe('checkReferences', () => {
        it('should return error if organisation could not be found', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            organisationRepoMock.findById.mockResolvedValueOnce(undefined);
            rolleRepoMock.findById.mockResolvedValueOnce(rolle);

            const result: Result<void, DomainError> = await sut.checkReferences(orga.id, rolle.id);

            expectErrResult(result);
            expect(result.error).toEqual(new EntityNotFoundError('Organisation', orga.id));
        });

        it('should return error if rolle could not be found', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            organisationRepoMock.findById.mockResolvedValueOnce(orga);
            rolleRepoMock.findById.mockResolvedValueOnce(undefined);

            const result: Result<void, DomainError> = await sut.checkReferences(orga.id, rolle.id);

            expectErrResult(result);
            expect(result.error).toEqual(new EntityNotFoundError('Rolle', rolle.id));
        });

        it('should return error if rolle can not be assigned', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true);
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                canBeAssignedToOrga: () => Promise.resolve(Err(new EntityNotFoundError('Rolle', rolle.id))),
            });
            organisationRepoMock.findById.mockResolvedValueOnce(orga);
            rolleRepoMock.findById.mockResolvedValueOnce(rolle);

            const result: Result<void, DomainError> = await sut.checkReferences(orga.id, rolle.id);

            expectErrResult(result);
            expect(result.error).toEqual(new EntityNotFoundError('Rolle', rolle.id));
        });

        it('should return error if rollenart does not match organisation', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.SYSADMIN,
                canBeAssignedToOrga: () => Promise.resolve(Err(new OrganisationMatchesRollenartError())),
            });
            organisationRepoMock.findById.mockResolvedValueOnce(orga);
            rolleRepoMock.findById.mockResolvedValueOnce(rolle);

            const result: Result<void, DomainError> = await sut.checkReferences(orga.id, rolle.id);

            expectErrResult(result);
            expect(result.error).toEqual(new RolleNurAnPassendeOrganisationError());
        });

        it('should return no error if everything is okay', async () => {
            const orga: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            const rolle: Rolle<true> = DoFactory.createRolle(true, {
                rollenart: RollenArt.LEHR,
                canBeAssignedToOrga: () => Promise.resolve(Ok(undefined)),
            });
            organisationRepoMock.findById.mockResolvedValueOnce(orga);
            rolleRepoMock.findById.mockResolvedValueOnce(rolle);

            const result: Result<void, DomainError> = await sut.checkReferences(orga.id, rolle.id);

            expectOkResult(result);
        });
    });
});
