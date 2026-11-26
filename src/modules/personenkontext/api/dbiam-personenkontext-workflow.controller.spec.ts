import { faker } from '@faker-js/faker';
import { BadRequestException } from '@nestjs/common';
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
import { PersonenkontexteUpdateError } from '../domain/error/personenkontexte-update.error.js';
import { LandesbediensteteKontextWorkflowService } from '../domain/landesbedienstete-kontext-workflow.service.js';
import { PersonenkontextCreationService } from '../domain/personenkontext-creation.service.js';
import { PersonenkontextWorkflowFactory } from '../domain/personenkontext-workflow.factory.js';
import { PersonenkontextWorkflowAggregate } from '../domain/personenkontext-workflow.js';
import { OperationContext } from '../domain/personenkontext.enums.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { type RoleOrganisationAssignmentValidator } from '../domain/role-organisation-assignment.validator.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextWorkflowController } from './dbiam-personenkontext-workflow.controller.js';
import { DBiamFindPersonenkontexteByPersonIdParams } from './param/dbiam-find-personenkontext-by-personid.params.js';
import { FindDbiamPersonenkontextWorkflowQueryParams } from './param/dbiam-find-personenkontextworkflow-query.params.js';
import { DbiamUpdatePersonenkontexteBodyParams } from './param/dbiam-update-personenkontexte.body.params.js';
import { type DbiamUpdatePersonenkontexteQueryParams } from './param/dbiam-update-personenkontexte.query.params.js';
import { type PersonenkontextWorkflowResponse } from './response/dbiam-personenkontext-workflow-response.js';
import { type PersonenkontexteUpdateResponse } from './response/personenkontexte-update.response.js';

describe('DbiamPersonenkontextWorkflowController Test', () => {
    let module: TestingModule;
    let sut: DbiamPersonenkontextWorkflowController;
    let personenkontextWorkflowMock: DeepMocked<PersonenkontextWorkflowAggregate>;
    let personenkontextWorkflowFactoryMock: DeepMocked<PersonenkontextWorkflowFactory>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let landesbediensteteKontextWorkflowServiceMock: DeepMocked<LandesbediensteteKontextWorkflowService>;

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
        landesbediensteteKontextWorkflowServiceMock = module.get(LandesbediensteteKontextWorkflowService);
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

        describe('/PUT commit', () => {
            it.each(['1234', undefined])(
                'should delegate Landesbediensteten updates with personalnummer %s to the dedicated service',
                async (personalnummer: string | undefined) => {
                    const params: DBiamFindPersonenkontexteByPersonIdParams = { personId: faker.string.uuid() };
                    const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                        personId: params.personId,
                    });
                    const bodyParams: DbiamUpdatePersonenkontexteBodyParams = {
                        count: 1,
                        lastModified: new Date('2026-01-01T00:00:00Z'),
                        personenkontexte: [
                            {
                                personId: params.personId,
                                organisationId: personenkontext.organisationId,
                                rolleId: personenkontext.rolleId,
                            },
                        ],
                        operationContext: OperationContext.LANDESBEDIENSTETEN_KONTEXT_ERWEITERN,
                    };
                    const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                    landesbediensteteKontextWorkflowServiceMock.commit.mockResolvedValueOnce([personenkontext]);

                    const response: PersonenkontexteUpdateResponse = await sut.commit(
                        params,
                        { personalnummer },
                        bodyParams,
                        permissions,
                    );

                    expect(landesbediensteteKontextWorkflowServiceMock.commit).toHaveBeenCalledExactlyOnceWith(
                        params.personId,
                        bodyParams.lastModified,
                        bodyParams.count,
                        bodyParams.personenkontexte,
                        permissions,
                        personalnummer,
                    );
                    expect(personenkontextWorkflowFactoryMock.createNew).not.toHaveBeenCalled();
                    expect(response.dBiamPersonenkontextResponses).toEqual([
                        {
                            personId: params.personId,
                            organisationId: personenkontext.organisationId,
                            rolleId: personenkontext.rolleId,
                            befristung: personenkontext.befristung,
                        },
                    ]);
                },
            );

            it.each([OperationContext.PERSON_ANLEGEN, OperationContext.PERSON_BEARBEITEN])(
                'should delegate %s updates to the standard workflow',
                async (operationContext: OperationContext) => {
                    const params: DBiamFindPersonenkontexteByPersonIdParams = { personId: faker.string.uuid() };
                    const bodyParams: DbiamUpdatePersonenkontexteBodyParams = {
                        count: 0,
                        personenkontexte: [],
                        operationContext,
                    };
                    const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                    personenkontextWorkflowFactoryMock.createNew.mockReturnValueOnce(personenkontextWorkflowMock);
                    personenkontextWorkflowMock.commit.mockResolvedValueOnce([]);

                    const response: PersonenkontexteUpdateResponse = await sut.commit(
                        params,
                        {},
                        bodyParams,
                        permissions,
                    );

                    expect(personenkontextWorkflowMock.commit).toHaveBeenCalledExactlyOnceWith(
                        params.personId,
                        undefined,
                        bodyParams.count,
                        bodyParams.personenkontexte,
                        permissions,
                        undefined,
                    );
                    expect(landesbediensteteKontextWorkflowServiceMock.commit).not.toHaveBeenCalled();
                    expect(response.dBiamPersonenkontextResponses).toEqual([]);
                },
            );

            describe('when errors occur', () => {
                it('should reject unsupported operation contexts without invoking a workflow', async () => {
                    const params: DBiamFindPersonenkontexteByPersonIdParams = { personId: faker.string.uuid() };
                    const bodyParams: DbiamUpdatePersonenkontexteBodyParams = Object.assign(
                        new DbiamUpdatePersonenkontexteBodyParams(),
                        { count: 0, personenkontexte: [], operationContext: 'UNSUPPORTED' },
                    );

                    await expect(sut.commit(params, {}, bodyParams, createPersonPermissionsMock())).rejects.toThrow(
                        new BadRequestException('Unsupported operation context for updating personenkontexte'),
                    );
                    expect(personenkontextWorkflowFactoryMock.createNew).not.toHaveBeenCalled();
                    expect(landesbediensteteKontextWorkflowServiceMock.commit).not.toHaveBeenCalled();
                });

                it('should propagate permission errors from the Landesbediensteten service', async () => {
                    const params: DBiamFindPersonenkontexteByPersonIdParams = { personId: faker.string.uuid() };
                    const bodyParams: DbiamUpdatePersonenkontexteBodyParams = {
                        count: 0,
                        personenkontexte: [],
                        operationContext: OperationContext.LANDESBEDIENSTETEN_KONTEXT_ERWEITERN,
                    };
                    const error: MissingPermissionsError = new MissingPermissionsError('Not authorized');
                    landesbediensteteKontextWorkflowServiceMock.commit.mockResolvedValueOnce(error);

                    await expect(sut.commit(params, {}, bodyParams, createPersonPermissionsMock())).rejects.toBe(error);
                    expect(personenkontextWorkflowFactoryMock.createNew).not.toHaveBeenCalled();
                });

                it('should propagate missing MPT permissions to the shared exception filter', async () => {
                    const params: DBiamFindPersonenkontexteByPersonIdParams = { personId: faker.string.uuid() };
                    const bodyParams: DbiamUpdatePersonenkontexteBodyParams = {
                        count: 0,
                        personenkontexte: [],
                        operationContext: OperationContext.PERSON_BEARBEITEN,
                    };
                    const error: MissingPermissionsError = new MissingPermissionsError(
                        'Unauthorized to modify MPT-Rollen at the organisation',
                    );
                    personenkontextWorkflowMock.commit.mockResolvedValueOnce(error);
                    personenkontextWorkflowFactoryMock.createNew.mockReturnValue(personenkontextWorkflowMock);

                    await expect(sut.commit(params, {}, bodyParams, createPersonPermissionsMock())).rejects.toBe(error);
                });

                it('should throw BadRequestException if updateResult is an instance of PersonenkontexteUpdateError', async () => {
                    const params: DBiamFindPersonenkontexteByPersonIdParams =
                        new DBiamFindPersonenkontexteByPersonIdParams();
                    Object.assign(params, { personId: faker.string.uuid() });
                    const bodyParams: DbiamUpdatePersonenkontexteBodyParams =
                        new DbiamUpdatePersonenkontexteBodyParams();
                    Object.assign(bodyParams, {
                        count: 1,
                        lastModified: new Date(),
                        personenkontexte: [],
                        operationContext: OperationContext.PERSON_BEARBEITEN,
                    });
                    const queryParams: DbiamUpdatePersonenkontexteQueryParams = {
                        personalnummer: '1234',
                    };
                    const updateError: PersonenkontexteUpdateError = new PersonenkontexteUpdateError(
                        'Update error message',
                    );
                    personenkontextWorkflowMock.commit.mockResolvedValueOnce(updateError);
                    personenkontextWorkflowFactoryMock.createNew.mockReturnValue(personenkontextWorkflowMock);

                    const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();

                    await expect(sut.commit(params, queryParams, bodyParams, personpermissions)).rejects.toThrow(
                        PersonenkontexteUpdateError,
                    );
                });
            });
        });
    });
});
