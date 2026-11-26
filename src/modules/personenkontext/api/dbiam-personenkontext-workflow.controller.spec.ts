import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';

import { type ConfigService } from '@nestjs/config';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { createPersonPermissionsMock, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { type Person } from '../../person/domain/person.js';
import { RolleFindService } from '../../rolle/domain/rolle-find.service.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type DbiamPersonenkontextFactory } from '../domain/dbiam-personenkontext.factory.js';
import { LandesbediensteteKontextWorkflowService } from '../domain/landesbedienstete-kontext-workflow.service.js';
import { PersonenkontextCreationService } from '../domain/personenkontext-creation.service.js';
import { PersonenkontextWorkflowFactory } from '../domain/personenkontext-workflow.factory.js';
import { PersonenkontextWorkflowAggregate } from '../domain/personenkontext-workflow.js';
import { OperationContext } from '../domain/personenkontext.enums.js';
import { type RoleOrganisationAssignmentValidator } from '../domain/role-organisation-assignment.validator.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextWorkflowController } from './dbiam-personenkontext-workflow.controller.js';
import { FindDbiamPersonenkontextWorkflowQueryParams } from './param/dbiam-find-personenkontextworkflow-query.params.js';
import { type PersonenkontextWorkflowResponse } from './response/dbiam-personenkontext-workflow-response.js';

describe('DbiamPersonenkontextWorkflowController Test', () => {
    let module: TestingModule;
    let sut: DbiamPersonenkontextWorkflowController;
    let personenkontextWorkflowMock: DeepMocked<PersonenkontextWorkflowAggregate>;
    let personenkontextWorkflowFactoryMock: DeepMocked<PersonenkontextWorkflowFactory>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [
                DbiamPersonenkontextWorkflowController,
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
                {
                    provide: PersonenkontextWorkflowFactory,
                    useValue: createMock(PersonenkontextWorkflowFactory),
                },
                {
                    provide: RolleFindService,
                    useValue: createMock(RolleFindService),
                },
                {
                    provide: PersonenkontextWorkflowAggregate,
                    useValue: vi.mockObject(
                        PersonenkontextWorkflowAggregate.createNew(
                            null as unknown as RolleRepo,
                            null as unknown as OrganisationRepository,
                            null as unknown as DbiamPersonenkontextFactory,
                            null as unknown as ConfigService,
                            null as unknown as RoleOrganisationAssignmentValidator,
                        ),
                    ),
                },
                {
                    provide: PersonenkontextCreationService,
                    useValue: createMock(PersonenkontextCreationService),
                },
                {
                    provide: LandesbediensteteKontextWorkflowService,
                    useValue: createMock(LandesbediensteteKontextWorkflowService),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
            ],
        }).compile();
        sut = module.get(DbiamPersonenkontextWorkflowController);

        personenkontextWorkflowMock = module.get(PersonenkontextWorkflowAggregate);
        personenkontextWorkflowFactoryMock = module.get(PersonenkontextWorkflowFactory);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('processStep', () => {
        describe.each([[OperationContext.PERSON_ANLEGEN], [OperationContext.PERSON_BEARBEITEN]])(
            'when context is %s',
            (operationContext: OperationContext) => {
                it('should return the selected organisation and disallow commit without selected roles', async () => {
                    const organisation: Organisation<true> = DoFactory.createOrganisation(true);

                    const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                    personenkontextWorkflowFactoryMock.createNew.mockReturnValueOnce(personenkontextWorkflowMock);
                    const params: FindDbiamPersonenkontextWorkflowQueryParams =
                        new FindDbiamPersonenkontextWorkflowQueryParams();

                    Object.assign(params, {
                        operationContext,
                        organisationId: organisation.id,
                    });

                    const response: PersonenkontextWorkflowResponse = await sut.processStep(params, personpermissions);

                    expect(response).toEqual({ selectedOrganisation: organisation.id, canCommit: false });
                });

                it('should disallow commit without an organisation', async () => {
                    const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

                    personenkontextWorkflowFactoryMock.createNew.mockReturnValueOnce(personenkontextWorkflowMock);

                    const params: FindDbiamPersonenkontextWorkflowQueryParams =
                        new FindDbiamPersonenkontextWorkflowQueryParams();
                    Object.assign(params, {
                        operationContext,
                    });

                    const response: PersonenkontextWorkflowResponse = await sut.processStep(params, personpermissions);

                    expect(response).toEqual({ canCommit: false });
                    expect(personenkontextWorkflowMock.findAllSchulstrukturknoten).not.toHaveBeenCalled();
                });

                it('should set canCommit to true if canCommit returns true', async () => {
                    const organisationId: string = faker.string.uuid();
                    const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.LAND,
                    });
                    const rolle: Rolle<true> = DoFactory.createRolle(true, {
                        administeredBySchulstrukturknoten: organisation.id,
                        rollenart: RollenArt.LERN,
                    });
                    const rollenIds: string[] = [rolle.id];

                    const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

                    const params: FindDbiamPersonenkontextWorkflowQueryParams =
                        new FindDbiamPersonenkontextWorkflowQueryParams();
                    Object.assign(params, {
                        operationContext,
                        organisationId,
                        rollenIds,
                    });
                    personenkontextWorkflowMock.canCommit.mockResolvedValue(Ok(undefined));
                    personenkontextWorkflowFactoryMock.createNew.mockReturnValue(personenkontextWorkflowMock);

                    const response: PersonenkontextWorkflowResponse = await sut.processStep(params, personpermissions);

                    expect(response).toEqual({
                        selectedOrganisation: organisationId,
                        selectedRollen: rollenIds,
                        canCommit: true,
                    });
                });

                it('should disallow commit when the admin cannot modify the person', async () => {
                    const person: Person<true> = DoFactory.createPerson(true);
                    const organisation: Organisation<true> = DoFactory.createOrganisation(true, {
                        name: faker.company.name(),
                    });
                    const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

                    personenkontextWorkflowFactoryMock.createNew.mockReturnValueOnce(personenkontextWorkflowMock);
                    personenkontextRepoMock.findByPersonAuthorized.mockResolvedValueOnce(
                        Err(new MissingPermissionsError('not authorized')),
                    );

                    const params: FindDbiamPersonenkontextWorkflowQueryParams =
                        new FindDbiamPersonenkontextWorkflowQueryParams();
                    Object.assign(params, {
                        operationContext,
                        organisationId: organisation.id,
                        personId: person.id,
                    });

                    const response: PersonenkontextWorkflowResponse = await sut.processStep(params, personpermissions);

                    expect(response).toEqual({ selectedOrganisation: organisation.id, canCommit: false });
                });
            },
        );
    });
});
