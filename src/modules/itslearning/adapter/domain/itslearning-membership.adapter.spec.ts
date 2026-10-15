import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';

import { ConfigTestModule, LoggingTestModule } from '../../../../../test/utils/index.js';
import { type DomainError } from '../../../../shared/error/domain.error.js';
import { ItsLearningError } from '../../../../shared/error/its-learning.error.js';
import { type CreateMembershipParams, CreateMembershipsAction } from '../technical/actions/create-memberships.action.js';
import {
    type MembershipResponse,
    ReadMembershipsForPersonAction,
} from '../technical/actions/read-memberships-for-person.action.js';
import { ItsLearningIMSESApiService } from '../technical/itslearning.api-service.js';
import { IMSESRoleType } from './role.enum.js';
import {
    ItslearningMembershipAdapter,
    type SetMembershipParams,
    type SetMembershipsResult,
} from './itslearning-membership.adapter.js';
import { DeleteMembershipsAction } from '../technical/actions/delete-memberships.action.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { RollenArt } from '../../../rolle/domain/rolle.enums.js';
import { Ok } from '../../../../shared/util/result.js';
import { type FailureStatusInfo, type MassResult } from '../technical/actions/base-mass-action.js';

function makeFailureStatus(description: string): FailureStatusInfo {
    return {
        codeMajor: 'failure',
        severity: 'error',
        codeMinor: {
            codeMinorField: [{ codeMinorName: 'error', codeMinorValue: 'error' }],
        },
        description: {
            language: 'en',
            text: description,
        },
    };
}

describe('Itslearning Membership Adapter', () => {
    let module: TestingModule;

    let sut: ItslearningMembershipAdapter;
    let itsLearningServiceMock: DeepMocked<ItsLearningIMSESApiService>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule],
            providers: [
                ItslearningMembershipAdapter,
                {
                    provide: ItsLearningIMSESApiService,
                    useValue: createMock(ItsLearningIMSESApiService),
                },
            ],
        }).compile();

        sut = module.get(ItslearningMembershipAdapter);
        itsLearningServiceMock = module.get(ItsLearningIMSESApiService);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    describe('readMembershipsForPerson', () => {
        it('should call the itslearning API', async () => {
            const personId: string = faker.string.uuid();
            const syncID: string = faker.string.uuid();

            const membershipResponse: MembershipResponse[] = [
                {
                    id: faker.string.uuid(),
                    groupId: faker.string.uuid(),
                    role: faker.helpers.enumValue(IMSESRoleType),
                },
            ];
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: [],
                    value: membershipResponse,
                },
            });

            await sut.readMembershipsForPerson(personId, syncID);

            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.objectContaining({ personId }), syncID);
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(
                expect.any(ReadMembershipsForPersonAction),
                syncID,
            );
        });

        it('should return the result', async () => {
            const membershipResponse: MembershipResponse[] = [
                {
                    id: faker.string.uuid(),
                    groupId: faker.string.uuid(),
                    role: faker.helpers.enumValue(IMSESRoleType),
                },
            ];
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: true,
                value: {
                    status: [],
                    value: membershipResponse,
                },
            });

            const result: Result<MembershipResponse[], DomainError> = await sut.readMembershipsForPerson(
                faker.string.uuid(),
            );

            expect(result).toEqual({ ok: true, value: membershipResponse });
        });
    });

    describe('createMemberships', () => {
        it('should call the itslearning API', async () => {
            const memberships: CreateMembershipParams[] = [
                {
                    id: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    groupId: faker.string.uuid(),
                    roleType: faker.helpers.enumValue(IMSESRoleType),
                },
            ];
            const syncID: string = faker.string.uuid();
            itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined }));

            await sut.createMemberships(memberships, syncID);

            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(
                expect.objectContaining({ params: memberships }),
                syncID,
            );
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.any(CreateMembershipsAction), syncID);
        });

        it('should not return error on success', async () => {
            const memberships: CreateMembershipParams[] = [
                {
                    id: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    groupId: faker.string.uuid(),
                    roleType: faker.helpers.enumValue(IMSESRoleType),
                },
            ];
            itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined }));

            const result: Option<DomainError> = await sut.createMemberships(memberships);

            expect(result).toBeUndefined();
        });

        it('should return error on failure', async () => {
            const memberships: CreateMembershipParams[] = [
                {
                    id: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    groupId: faker.string.uuid(),
                    roleType: faker.helpers.enumValue(IMSESRoleType),
                },
            ];
            itsLearningServiceMock.send.mockResolvedValueOnce(
                Ok({
                    status: [makeFailureStatus('Some Error')],
                    value: undefined,
                }),
            );

            const result: Option<DomainError> = await sut.createMemberships(memberships);
            const expectedError: ItsLearningError = new ItsLearningError('1 of 1 Requests failed', [
                makeFailureStatus('Some Error'),
            ]);

            expect(result).toEqual(expectedError);
        });

        it('should return error on fail', async () => {
            const error: DomainError = new ItsLearningError('Test Error');
            const memberships: CreateMembershipParams[] = [
                {
                    id: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    groupId: faker.string.uuid(),
                    roleType: faker.helpers.enumValue(IMSESRoleType),
                },
            ];
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error,
            });

            const result: Option<DomainError> = await sut.createMemberships(memberships);

            expect(result).toBe(error);
        });
    });

    describe('createMembershipsMass', () => {
        it('should call the itslearning API and return the result', async () => {
            const memberships: CreateMembershipParams[] = [
                {
                    id: faker.string.uuid(),
                    personId: faker.string.uuid(),
                    groupId: faker.string.uuid(),
                    roleType: faker.helpers.enumValue(IMSESRoleType),
                },
            ];
            const syncID: string = faker.string.uuid();
            itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined }));

            const result: Result<MassResult<void>, DomainError> = await sut.createMembershipsMass(memberships, syncID);

            expect(result).toEqual({
                ok: true,
                value: {
                    status: [],
                    value: undefined,
                },
            });
        });
    });

    describe('removeMemberships', () => {
        it('should call the itslearning API', async () => {
            const membershipIDs: string[] = [faker.string.uuid()];
            const syncID: string = faker.string.uuid();
            itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined }));

            await sut.removeMemberships(membershipIDs, syncID);

            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(
                expect.objectContaining({ membershipIDs }),
                syncID,
            );
            expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.any(DeleteMembershipsAction), syncID);
        });

        it('should not return error on success', async () => {
            const membershipIDs: string[] = [faker.string.uuid()];
            itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined }));

            const result: Option<DomainError> = await sut.removeMemberships(membershipIDs);

            expect(result).toBeUndefined();
        });

        it('should return error on failure', async () => {
            const memberships: string[] = [faker.string.uuid()];
            itsLearningServiceMock.send.mockResolvedValueOnce(
                Ok({
                    status: [makeFailureStatus('Some Error')],
                    value: undefined,
                }),
            );

            const result: Option<DomainError> = await sut.removeMemberships(memberships);

            expect(result).toEqual(new ItsLearningError('1 of 1 Requests failed', [makeFailureStatus('Some Error')]));
        });

        it('should return error on fail', async () => {
            const error: DomainError = new ItsLearningError('Test Error');
            const membershipIDs: string[] = [faker.string.uuid()];
            itsLearningServiceMock.send.mockResolvedValueOnce({
                ok: false,
                error,
            });

            const result: Option<DomainError> = await sut.removeMemberships(membershipIDs);

            expect(result).toBe(error);
        });
    });

    describe('removeMembershipsMass', () => {
        it('should call the itslearning API and return the result', async () => {
            const memberships: string[] = [faker.string.uuid()];
            const syncID: string = faker.string.uuid();
            itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined }));

            const result: Result<MassResult<void>, DomainError> = await sut.removeMembershipsMass(memberships, syncID);

            expect(result).toEqual({
                ok: true,
                value: {
                    status: [],
                    value: undefined,
                },
            });
        });
    });

    describe('setMemberships', () => {
        describe('reading current memberships', () => {
            it('should read current memberships for person', async () => {
                const personId: string = faker.string.uuid();
                itsLearningServiceMock.send.mockResolvedValueOnce({ ok: true, value: { status: [], value: [] } }); // Read Memberships
                const syncID: string = faker.string.uuid();

                await sut.setMemberships(personId, [], syncID);

                expect(itsLearningServiceMock.send).toHaveBeenCalledWith(expect.objectContaining({ personId }), syncID);
                expect(itsLearningServiceMock.send).toHaveBeenCalledWith(
                    expect.any(ReadMembershipsForPersonAction),
                    syncID,
                );
            });

            it('should abort if memberships can not be read', async () => {
                const error: DomainError = new ItsLearningError('Error Test');
                const personId: string = faker.string.uuid();
                itsLearningServiceMock.send.mockResolvedValueOnce({ ok: false, error });

                const result: Result<SetMembershipsResult, DomainError> = await sut.setMemberships(personId, []);

                expect(result).toEqual({ ok: false, error });
            });
        });

        describe('removing unneeded memberships', () => {
            it("should remove memberships that we didn't set", async () => {
                const personId: string = faker.string.uuid();
                const existingMemberships: MembershipResponse[] = [
                    { id: 'test', groupId: 'test-group', role: faker.helpers.enumValue(IMSESRoleType) },
                ];
                itsLearningServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: { status: [], value: existingMemberships },
                }); // Read Memberships
                itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined })); // Remove Memberships

                const setResult: Result<SetMembershipsResult, DomainError> = await sut.setMemberships(personId, []);

                expect(setResult).toEqual({ ok: true, value: { updated: 0, deleted: 1 } });
            });

            it('should try to remove the root memberships', async () => {
                const personId: string = faker.string.uuid();
                const existingMemberships: MembershipResponse[] = [
                    { id: 'sh-test', groupId: 'sh', role: faker.helpers.enumValue(IMSESRoleType) },
                    { id: 'oeffentlich-test', groupId: 'oeffentlich', role: faker.helpers.enumValue(IMSESRoleType) },
                    { id: 'ersatz-test', groupId: 'ersatz', role: faker.helpers.enumValue(IMSESRoleType) },
                ];
                itsLearningServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: { status: [], value: existingMemberships },
                }); // Read Memberships
                itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined })); // Remove Memberships

                const setResult: Result<SetMembershipsResult, DomainError> = await sut.setMemberships(personId, []);

                expect(setResult).toEqual({ ok: true, value: { updated: 3, deleted: 0 } });
            });

            it('should log error if memberships could not be removed', async () => {
                const error: DomainError = new ItsLearningError('Error Test');
                const personId: string = faker.string.uuid();
                const existingMemberships: MembershipResponse[] = [
                    { id: 'test', groupId: 'test-group', role: faker.helpers.enumValue(IMSESRoleType) },
                ];
                itsLearningServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: { status: [], value: existingMemberships },
                }); // Read Memberships
                itsLearningServiceMock.send.mockResolvedValueOnce({ ok: false, error: error }); // Remove Memberships

                const setResult: Result<SetMembershipsResult, DomainError> = await sut.setMemberships(personId, []);

                expect(setResult).toEqual({ ok: true, value: { updated: 0, deleted: 0 } });
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could not delete 1 memberships for person with ID ${personId}.`,
                    error,
                );
            });
        });

        describe('create/update memberships', () => {
            it('should create/update memberships', async () => {
                const personId: string = faker.string.uuid();
                const currentMemberships: SetMembershipParams[] = [
                    { organisationId: 'orga-test', role: faker.helpers.enumValue(RollenArt) },
                ];
                itsLearningServiceMock.send.mockResolvedValueOnce({ ok: true, value: { status: [], value: [] } }); // Read Memberships
                itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined })); // Create Memberships

                const setResult: Result<SetMembershipsResult, DomainError> = await sut.setMemberships(
                    personId,
                    currentMemberships,
                );

                expect(setResult).toEqual({ ok: true, value: { updated: 1, deleted: 0 } });
            });

            it('should try to update the root memberships', async () => {
                const personId: string = faker.string.uuid();
                const existingMemberships: MembershipResponse[] = [
                    { id: 'sh-test', groupId: 'sh', role: faker.helpers.enumValue(IMSESRoleType) },
                    { id: 'oeffentlich-test', groupId: 'oeffentlich', role: faker.helpers.enumValue(IMSESRoleType) },
                    { id: 'ersatz-test', groupId: 'ersatz', role: faker.helpers.enumValue(IMSESRoleType) },
                ];
                itsLearningServiceMock.send.mockResolvedValueOnce({
                    ok: true,
                    value: { status: [], value: existingMemberships },
                }); // Read Memberships
                itsLearningServiceMock.send.mockResolvedValueOnce(Ok({ status: [], value: undefined })); // Remove Memberships

                const setResult: Result<SetMembershipsResult, DomainError> = await sut.setMemberships(personId, []);

                expect(setResult).toEqual({ ok: true, value: { updated: 3, deleted: 0 } });
            });

            it('should log error if memberships could not be removed', async () => {
                const error: DomainError = new ItsLearningError('Error Test');
                const personId: string = faker.string.uuid();
                const currentMemberships: SetMembershipParams[] = [
                    { organisationId: 'orga-test', role: faker.helpers.enumValue(RollenArt) },
                ];
                itsLearningServiceMock.send.mockResolvedValueOnce({ ok: true, value: { status: [], value: [] } }); // Read Memberships
                itsLearningServiceMock.send.mockResolvedValueOnce({ ok: false, error: error }); // Create Memberships

                const setResult: Result<SetMembershipsResult, DomainError> = await sut.setMemberships(
                    personId,
                    currentMemberships,
                );

                expect(setResult).toEqual({ ok: true, value: { updated: 0, deleted: 0 } });
                expect(loggerMock.error).toHaveBeenCalledWith(
                    `Could not create/update 1 memberships for person with ID ${personId}.`,
                    error,
                );
            });
        });
    });
});
