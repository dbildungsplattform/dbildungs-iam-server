import { createMock, DeepMocked } from '../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../test/utils/config-test.module.js';
import { DoFactory } from '../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../test/utils/logging-test.module.js';
import { DomainError } from '../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../shared/error/entity-not-found.error.js';
import { KeycloakClientError } from '../../shared/error/keycloak-client.error.js';
import { MissingPermissionsError } from '../../shared/error/missing-permissions.error.js';
import { PersonID } from '../../shared/types/aggregate-ids.types.js';
import { PersonPermissions } from '../authentication/domain/person-permissions.js';
import { EmailAddressDeletionService } from '../email/email-address-deletion/email-address-deletion.service.js';
import { KeycloakUserService } from '../keycloak-administration/domain/keycloak-user.service.js';
import { UserLock } from '../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../keycloak-administration/repository/user-lock.repository.js';
import { PersonLockOccasion } from '../person/domain/person.enums.js';
import { Person } from '../person/domain/person.js';
import { PersonRepository } from '../person/persistence/person.repository.js';
import { PersonDeleteService } from '../person/person-deletion/person-delete.service.js';
import { PersonenkontexteUpdateError } from '../personenkontext/domain/error/personenkontexte-update.error.js';
import { PersonenkontextWorkflowFactory } from '../personenkontext/domain/personenkontext-workflow.factory.js';
import { PersonenkontextWorkflowAggregate } from '../personenkontext/domain/personenkontext-workflow.js';
import { Personenkontext } from '../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ServiceProviderService } from '../service-provider/domain/service-provider.service.js';
import { CronController } from './cron.controller.js';
import { RolleRepo } from '../rolle/repo/rolle.repo.js';
import { PersonenkontextWorkflowSharedKernel } from '../personenkontext/domain/personenkontext-workflow-shared-kernel.js';
import { OrganisationRepository } from '../organisation/persistence/organisation.repository.js';
import { DbiamPersonenkontextFactory } from '../personenkontext/domain/dbiam-personenkontext.factory.js';
import { ConfigService } from '@nestjs/config';
import { createPersonPermissionsMock } from '../../../test/utils/auth.mock.js';
import { IPersonPermissions } from '../../shared/permissions/person-permissions.interface.js';
import { EscalatedPersonPermissionsFactory } from '../permission/escalated-person-permissions.factory.js';
import { RollenSystemRecht } from '../rolle/domain/systemrecht.js';
import { VidisSyncService } from '../vidis/core/vidis.sync-service.js';

class UnknownError extends DomainError {
    public constructor(message: string) {
        super(message, '');
    }
}

const PERSON_WITHOUT_ORG_LIMIT: number = 30;

describe('CronController', () => {
    let cronController: CronController;
    let keycloakUserServiceMock: DeepMocked<KeycloakUserService>;
    let personRepositoryMock: DeepMocked<PersonRepository>;
    let personDeleteServiceMock: DeepMocked<PersonDeleteService>;
    let personenKontextRepositoryMock: DeepMocked<DBiamPersonenkontextRepo>;
    let personenkontextWorkflowFactoryMock: DeepMocked<PersonenkontextWorkflowFactory>;
    let permissionsMock: DeepMocked<PersonPermissions>;
    let personenkontextWorkflowMock: DeepMocked<PersonenkontextWorkflowAggregate>;
    let userLockRepositoryMock: DeepMocked<UserLockRepository>;
    let emailAddressDeletionServiceMock: DeepMocked<EmailAddressDeletionService>;
    let vidisSyncServiceMock: DeepMocked<VidisSyncService>;
    const escalatedPersonPermissionsFactoryMock: DeepMocked<EscalatedPersonPermissionsFactory> = createMock(
        EscalatedPersonPermissionsFactory,
    );

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule],
            providers: [
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: PersonDeleteService,
                    useValue: createMock(PersonDeleteService),
                },
                {
                    provide: EmailAddressDeletionService,
                    useValue: createMock(EmailAddressDeletionService),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: PersonenkontextWorkflowFactory,
                    useValue: createMock(PersonenkontextWorkflowFactory),
                },
                {
                    provide: PersonenkontextWorkflowAggregate,
                    useValue: vi.mockObject(
                        PersonenkontextWorkflowAggregate.createNew(
                            null as unknown as RolleRepo,
                            null as unknown as OrganisationRepository,
                            null as unknown as DbiamPersonenkontextFactory,
                            null as unknown as ConfigService,
                            null as unknown as PersonenkontextWorkflowSharedKernel,
                        ),
                    ),
                },
                {
                    provide: UserLockRepository,
                    useValue: createMock(UserLockRepository),
                },
                {
                    provide: ServiceProviderService,
                    useValue: createMock(ServiceProviderService),
                },
                {
                    provide: EscalatedPersonPermissionsFactory,
                    useValue: escalatedPersonPermissionsFactoryMock,
                },
                {
                    provide: VidisSyncService,
                    useValue: createMock(VidisSyncService),
                },
            ],
            controllers: [CronController],
        })
            .overrideProvider(EscalatedPersonPermissionsFactory)
            .useValue(escalatedPersonPermissionsFactoryMock)
            .compile();

        cronController = module.get(CronController);
        keycloakUserServiceMock = module.get(KeycloakUserService);
        personenKontextRepositoryMock = module.get(DBiamPersonenkontextRepo);
        personRepositoryMock = module.get(PersonRepository);
        personDeleteServiceMock = module.get(PersonDeleteService);
        personenkontextWorkflowFactoryMock = module.get(PersonenkontextWorkflowFactory);
        personenkontextWorkflowMock = module.get(PersonenkontextWorkflowAggregate);
        userLockRepositoryMock = module.get(UserLockRepository);
        permissionsMock = createPersonPermissionsMock();
        emailAddressDeletionServiceMock = module.get(EmailAddressDeletionService);
        vidisSyncServiceMock = module.get(VidisSyncService);
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('/PUT cron/vidis-sync', () => {
        it('should trigger VIDIS sync for authorized users', async () => {
            permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
            vidisSyncServiceMock.sync.mockResolvedValueOnce();

            await expect(cronController.triggerVidisSync(permissionsMock)).resolves.toBeUndefined();

            expect(permissionsMock.hasSystemrechteAtRootOrganisation).toHaveBeenCalledWith([
                RollenSystemRecht.CRON_DURCHFUEHREN,
            ]);
            expect(vidisSyncServiceMock.sync).toHaveBeenCalledTimes(1);
        });

        it('should throw when the user has no cron permission', async () => {
            permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);

            await expect(cronController.triggerVidisSync(permissionsMock)).rejects.toThrow(
                'Failed to trigger VIDIS sync due to an internal server error.',
            );
            expect(vidisSyncServiceMock.sync).not.toHaveBeenCalled();
        });

        it('should return immediately when VIDIS sync fails in the background', async () => {
            permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
            vidisSyncServiceMock.sync.mockRejectedValueOnce(new Error('sync failed'));

            await expect(cronController.triggerVidisSync(permissionsMock)).resolves.toBeUndefined();
            expect(vidisSyncServiceMock.sync).toHaveBeenCalledTimes(1);
        });
    });

    describe('/PUT cron/kopers-lock', () => {
        describe('when there are users to lock', () => {
            it('should return true when all users are successfully locked', async () => {
                const personMock1: Person<true> = DoFactory.createPerson(true);
                const personMock2: Person<true> = DoFactory.createPerson(true);
                const personMock3: Person<true> = DoFactory.createPerson(true);

                const mockKeycloakIds: [PersonID, string][] = [
                    [personMock1.id, personMock1.keycloakUserId!],
                    [personMock2.id, personMock2.keycloakUserId!],
                    [personMock3.id, personMock3.keycloakUserId!],
                ];
                personRepositoryMock.findById.mockResolvedValueOnce(personMock1);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock2);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock3);
                personRepositoryMock.getKoPersUserLockList.mockResolvedValueOnce(mockKeycloakIds);
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });

                const result: boolean = await cronController.koPersUserLock(permissionsMock);

                expect(result).toBe(true);
                expect(personRepositoryMock.getKoPersUserLockList).toHaveBeenCalled();
                expect(keycloakUserServiceMock.updateKeycloakUserStatus).toHaveBeenCalledTimes(mockKeycloakIds.length);
            });
        });

        describe('when there are no users to lock', () => {
            it('should return false', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.getKoPersUserLockList.mockResolvedValueOnce([]);

                const result: boolean = await cronController.koPersUserLock(permissionsMock);

                expect(result).toBe(true);
                expect(personRepositoryMock.getKoPersUserLockList).toHaveBeenCalled();
            });
        });

        describe('when locking users fails', () => {
            it('should return false when at least one user fails to lock', async () => {
                const personMock1: Person<true> = DoFactory.createPerson(true);
                const personMock2: Person<true> = DoFactory.createPerson(true);
                const personMock3: Person<true> = DoFactory.createPerson(true);

                const mockKeycloakIds: [PersonID, string][] = [
                    [personMock1.id, personMock1.keycloakUserId!],
                    [personMock2.id, personMock2.keycloakUserId!],
                    [personMock3.id, personMock3.keycloakUserId!],
                ];
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock1);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock2);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock3);
                personRepositoryMock.getKoPersUserLockList.mockResolvedValueOnce(mockKeycloakIds);
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({
                    ok: false,
                    error: new KeycloakClientError('Could not update user status or custom attributes'),
                });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });

                const result: boolean = await cronController.koPersUserLock(permissionsMock);

                expect(result).toBe(false);
                expect(personRepositoryMock.getKoPersUserLockList).toHaveBeenCalled();
                expect(keycloakUserServiceMock.updateKeycloakUserStatus).toHaveBeenCalledTimes(mockKeycloakIds.length);
            });
        });

        describe('when an exception is thrown', () => {
            it('should throw an error when there is an internal error', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.getKoPersUserLockList.mockImplementationOnce(() => {
                    throw new Error('Some internal error');
                });

                await expect(cronController.koPersUserLock(permissionsMock)).rejects.toThrow(
                    'Failed to lock users due to an internal server error.',
                );
            });
            it('should throw an error if permission check for cron permission fails', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);
                await expect(cronController.koPersUserLock(permissionsMock)).rejects.toThrow(
                    'Failed to lock users due to an internal server error.',
                );
            });
        });
    });

    describe('/PUT cron/kontext-expired', () => {
        describe('when there are organisations to remove', () => {
            it('should return true when all personenKontexte are successfully removed', async () => {
                const today: Date = new Date();
                const daysAgo: Date = new Date();
                daysAgo.setDate(daysAgo.getDate() - 1);
                const person1: Person<true> = DoFactory.createPerson(true);
                const person2: Person<true> = DoFactory.createPerson(true);
                const person3: Person<true> = DoFactory.createPerson(true);
                const personenKontextMock1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: daysAgo,
                    personId: person1.id,
                });
                const personenKontextMock2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: daysAgo,
                    personId: person2.id,
                });
                const personenKontextMock3: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: daysAgo,
                    personId: person3.id,
                });
                const personenKontextMock4: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: today,
                    personId: person1.id,
                });
                const personenKontextMock5: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: today,
                    personId: person2.id,
                });

                const mockPersonenKontexte: Map<string, Personenkontext<true>[]> = new Map([
                    [person1.id, [personenKontextMock1, personenKontextMock4]],
                    [person2.id, [personenKontextMock2, personenKontextMock5]],
                    [person3.id, [personenKontextMock3]],
                ]);

                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personenKontextRepositoryMock.getPersonenKontexteWithExpiredBefristung.mockResolvedValueOnce(
                    mockPersonenKontexte,
                );
                personRepositoryMock.findById.mockResolvedValueOnce(person1);
                personRepositoryMock.findById.mockResolvedValueOnce(person2);
                personRepositoryMock.findById.mockResolvedValueOnce(person3);
                personenkontextWorkflowFactoryMock.createNew.mockReturnValue(personenkontextWorkflowMock);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce([]);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce([]);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce([]);

                const result: boolean =
                    await cronController.removePersonenKontexteWithExpiredBefristungFromUsers(permissionsMock);

                expect(result).toBe(true);
                expect(personenKontextRepositoryMock.getPersonenKontexteWithExpiredBefristung).toHaveBeenCalled();
                expect(personenkontextWorkflowFactoryMock.createNew).toHaveBeenCalledTimes(3);
            });
        });

        describe('when there are no organisations to remove', () => {
            it('should return true when no organisations exceed their limit', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personenKontextRepositoryMock.getPersonenKontexteWithExpiredBefristung.mockResolvedValueOnce(new Map());

                const result: boolean =
                    await cronController.removePersonenKontexteWithExpiredBefristungFromUsers(permissionsMock);

                expect(result).toBe(true);
                expect(personenKontextRepositoryMock.getPersonenKontexteWithExpiredBefristung).toHaveBeenCalled();
            });
        });

        describe('when removing organisations fails', () => {
            it('should return false when at least one organisation removal fails', async () => {
                const today: Date = new Date();
                const daysAgo: Date = new Date(today.setDate(today.getDate() - 1));
                const person1: Person<true> = DoFactory.createPerson(true);
                const person2: Person<true> = DoFactory.createPerson(true);
                const person3: Person<true> = DoFactory.createPerson(true);

                const personenKontextMock1: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: daysAgo,
                    personId: person1.id,
                });
                const personenKontextMock2: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: daysAgo,
                    personId: person2.id,
                });
                const personenKontextMock3: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: daysAgo,
                    personId: person3.id,
                });
                const personenKontextMock4: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: today,
                    personId: person1.id,
                });
                const personenKontextMock5: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                    befristung: today,
                    personId: person2.id,
                });

                const mockPersonenKontexte: Map<string, Personenkontext<true>[]> = new Map([
                    [person1.id, [personenKontextMock1, personenKontextMock4]],
                    [person2.id, [personenKontextMock2, personenKontextMock5]],
                    [person3.id, [personenKontextMock3]],
                ]);

                personRepositoryMock.findById.mockResolvedValueOnce(person1);
                personRepositoryMock.findById.mockResolvedValueOnce(person2);
                personRepositoryMock.findById.mockResolvedValueOnce(person3);
                personenKontextRepositoryMock.getPersonenKontexteWithExpiredBefristung.mockResolvedValueOnce(
                    mockPersonenKontexte,
                );

                const mockResult: Personenkontext<true>[] = [personenKontextMock1, personenKontextMock4];
                const updateError: PersonenkontexteUpdateError = new PersonenkontexteUpdateError(
                    'Update error message',
                );
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce(mockResult);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce(mockResult);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce(updateError);
                personenkontextWorkflowFactoryMock.createNew.mockReturnValue(personenkontextWorkflowMock);

                const result: boolean =
                    await cronController.removePersonenKontexteWithExpiredBefristungFromUsers(permissionsMock);

                expect(result).toBe(false); // Expect false since at least one removal failed
                expect(personenKontextRepositoryMock.getPersonenKontexteWithExpiredBefristung).toHaveBeenCalled();
                expect(personenkontextWorkflowFactoryMock.createNew).toHaveBeenCalledTimes(3); // Ensure createNew was called three times
                expect(personenkontextWorkflowMock.commit).toHaveBeenCalledTimes(3); // Ensure commit is called three times
            });
        });

        describe('when an exception is thrown', () => {
            it('should throw an error when there is an internal server error', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personenKontextRepositoryMock.getPersonenKontexteWithExpiredBefristung.mockImplementationOnce(() => {
                    throw new Error('Some internal error');
                });

                await expect(
                    cronController.removePersonenKontexteWithExpiredBefristungFromUsers(permissionsMock),
                ).rejects.toThrow('Failed to remove kontexte due to an internal server error.');
            });
            it('should throw an error if permission check for cron permission fails', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);
                await expect(
                    cronController.removePersonenKontexteWithExpiredBefristungFromUsers(permissionsMock),
                ).rejects.toThrow('Failed to remove kontexte due to an internal server error.');
            });
        });
    });

    describe('/PUT cron/person-without-org', () => {
        describe('when there are users to remove', () => {
            it('should return true when all users are successfully removed', async () => {
                const personMock1: Person<true> = DoFactory.createPerson(true);
                const personMock2: Person<true> = DoFactory.createPerson(true);
                const personMock3: Person<true> = DoFactory.createPerson(true);
                const mockUserIds: string[] = [personMock1.id, personMock2.id, personMock3.id];
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock1);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock2);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock3);
                personRepositoryMock.getPersonWithoutOrgDeleteList.mockResolvedValueOnce({
                    ids: mockUserIds,
                    total: mockUserIds.length,
                });
                personDeleteServiceMock.deletePersonAfterDeadlineExceeded.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                personDeleteServiceMock.deletePersonAfterDeadlineExceeded.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                personDeleteServiceMock.deletePersonAfterDeadlineExceeded.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                personenkontextWorkflowMock.commit.mockResolvedValueOnce([]);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce([]);
                personenkontextWorkflowMock.commit.mockResolvedValueOnce([]);
                personenkontextWorkflowFactoryMock.createNew.mockReturnValue(personenkontextWorkflowMock);

                const personPermissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
                const result: boolean = await cronController.personWithoutOrgDelete(personPermissionsMock);

                expect(result).toBe(true);
                expect(personDeleteServiceMock.deletePersonAfterDeadlineExceeded).toHaveBeenCalled();
                expect(personDeleteServiceMock.deletePersonAfterDeadlineExceeded).toHaveBeenCalledTimes(
                    mockUserIds.length,
                );
                expect(personRepositoryMock.getPersonWithoutOrgDeleteList).toHaveBeenCalledWith(
                    PERSON_WITHOUT_ORG_LIMIT,
                );
            });
        });

        describe('when there are no users to remove', () => {
            it('should return false', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.getPersonWithoutOrgDeleteList.mockResolvedValueOnce({ ids: [], total: 0 });

                const personPermissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
                const result: boolean = await cronController.personWithoutOrgDelete(personPermissionsMock);

                expect(result).toBe(true);
                expect(personRepositoryMock.getPersonWithoutOrgDeleteList).toHaveBeenCalled();
            });
        });

        describe('when removing users fails', () => {
            it('should return false when at least one user fails to be removed', async () => {
                const personMock1: Person<true> = DoFactory.createPerson(true);
                const personMock2: Person<true> = DoFactory.createPerson(true);
                const personMock3: Person<true> = DoFactory.createPerson(true);
                const mockUserIds: string[] = [personMock1.id, personMock2.id, personMock3.id];
                personRepositoryMock.findById.mockResolvedValueOnce(personMock1);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock2);
                personRepositoryMock.findById.mockResolvedValueOnce(personMock3);

                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.getPersonWithoutOrgDeleteList.mockResolvedValueOnce({
                    ids: mockUserIds,
                    total: mockUserIds.length,
                });
                personDeleteServiceMock.deletePersonAfterDeadlineExceeded.mockResolvedValueOnce({
                    ok: true,
                    value: undefined,
                });
                personDeleteServiceMock.deletePersonAfterDeadlineExceeded.mockResolvedValueOnce({
                    ok: false,
                    error: new MissingPermissionsError(''),
                });

                const personPermissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
                const result: boolean = await cronController.personWithoutOrgDelete(personPermissionsMock);

                expect(result).toBe(false);
                expect(personRepositoryMock.getPersonWithoutOrgDeleteList).toHaveBeenCalled();
                expect(personDeleteServiceMock.deletePersonAfterDeadlineExceeded).toHaveBeenCalledTimes(
                    mockUserIds.length,
                );
            });
        });

        describe('when an exception is thrown', () => {
            it('should throw an error when there is an internal error', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.getPersonWithoutOrgDeleteList.mockImplementationOnce(() => {
                    throw new Error('Some internal error');
                });

                const personPermissionsMock: IPersonPermissions = createPersonPermissionsMock();
                await expect(cronController.personWithoutOrgDelete(personPermissionsMock)).rejects.toThrow(
                    'Failed to remove users due to an internal server error.',
                );
            });
            it('should throw an error if permission check for cron permission fails', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);
                await expect(cronController.personWithoutOrgDelete(permissionsMock)).rejects.toThrow(
                    'Failed to remove users due to an internal server error.',
                );
            });
        });
    });
    describe('/PUT cron/unlock', () => {
        describe('when there are users to unlock', () => {
            it('should return true when all users are successfully locked', async () => {
                const mockPerson1: Person<true> = DoFactory.createPerson(true);
                const mockPerson2: Person<true> = DoFactory.createPerson(true);
                const mockPerson3: Person<true> = DoFactory.createPerson(true);
                const mockUserLock1: UserLock = {
                    person: mockPerson1.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLock2: UserLock = {
                    person: mockPerson2.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLock3: UserLock = {
                    person: mockPerson3.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLocks: UserLock[] = [mockUserLock1, mockUserLock2, mockUserLock3];

                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                userLockRepositoryMock.getLocksToUnlock.mockResolvedValueOnce(mockUserLocks);
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: mockPerson1,
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: mockPerson2,
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: mockPerson3,
                });

                const result: boolean = await cronController.unlockUsersWithExpiredLocks(permissionsMock);

                expect(result).toBe(true);
                expect(userLockRepositoryMock.getLocksToUnlock).toHaveBeenCalled();
                expect(keycloakUserServiceMock.updateKeycloakUserStatus).toHaveBeenCalledTimes(mockUserLocks.length);
            });
        });

        describe('when there are no users to unlock', () => {
            it('should return false', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                userLockRepositoryMock.getLocksToUnlock.mockResolvedValueOnce([]);
                const personPermissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);

                const result: boolean = await cronController.unlockUsersWithExpiredLocks(personPermissionsMock);

                expect(result).toBe(true);
                expect(userLockRepositoryMock.getLocksToUnlock).toHaveBeenCalled();
            });
        });

        describe('when unlocking users fails', () => {
            it('should return false when at least one user fails to unlock', async () => {
                const mockPerson1: Person<true> = DoFactory.createPerson(true);
                const mockPerson2: Person<true> = DoFactory.createPerson(true);
                const mockPerson3: Person<true> = DoFactory.createPerson(true);
                const mockUserLock1: UserLock = {
                    person: mockPerson1.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLock2: UserLock = {
                    person: mockPerson2.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLock3: UserLock = {
                    person: mockPerson3.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLocks: UserLock[] = [mockUserLock1, mockUserLock2, mockUserLock3];

                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: mockPerson1,
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: mockPerson2,
                });
                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: mockPerson3,
                });

                userLockRepositoryMock.getLocksToUnlock.mockResolvedValueOnce(mockUserLocks);
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });
                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({
                    ok: false,
                    error: new KeycloakClientError('Could not update user status or custom attributes'),
                });

                const result: boolean = await cronController.unlockUsersWithExpiredLocks(permissionsMock);

                expect(result).toBe(false);
                expect(userLockRepositoryMock.getLocksToUnlock).toHaveBeenCalled();
                expect(keycloakUserServiceMock.updateKeycloakUserStatus).toHaveBeenCalledTimes(mockUserLocks.length);
            });
        });

        describe('when an exception is thrown', () => {
            it('should throw an error when there is an internal error', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                userLockRepositoryMock.getLocksToUnlock.mockImplementationOnce(() => {
                    throw new Error('Some internal error');
                });

                await expect(cronController.unlockUsersWithExpiredLocks(permissionsMock)).rejects.toThrow(
                    'Failed to unlock users due to an internal server error.',
                );
            });
        });
        describe('when the person permission check fails', () => {
            it('should throw an error if permission check for cron permission fails', async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);
                await expect(cronController.unlockUsersWithExpiredLocks(permissionsMock)).rejects.toThrow(
                    'Failed to unlock users due to an internal server error.',
                );
            });

            it('should return false if permission check for a user fails', async () => {
                const mockPerson1: Person<true> = DoFactory.createPerson(true);
                const mockPerson2: Person<true> = DoFactory.createPerson(true);
                const mockUserLock1: UserLock = {
                    person: mockPerson1.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLock2: UserLock = {
                    person: mockPerson2.id,
                    created_at: new Date(),
                    locked_until: new Date(),
                    locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
                    locked_by: 'CRON',
                };
                const mockUserLocks: UserLock[] = [mockUserLock1, mockUserLock2];

                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                userLockRepositoryMock.getLocksToUnlock.mockResolvedValueOnce(mockUserLocks);

                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: false,
                    error: new EntityNotFoundError('User does not have permission'),
                });

                personRepositoryMock.getPersonIfAllowed.mockResolvedValueOnce({
                    ok: true,
                    value: mockPerson2,
                });

                keycloakUserServiceMock.updateKeycloakUserStatus.mockResolvedValueOnce({ ok: true, value: undefined });

                const result: boolean = await cronController.unlockUsersWithExpiredLocks(permissionsMock);

                expect(result).toBe(false);
                expect(userLockRepositoryMock.getLocksToUnlock).toHaveBeenCalled();
                expect(personRepositoryMock.getPersonIfAllowed).toHaveBeenCalledTimes(mockUserLocks.length);
                expect(keycloakUserServiceMock.updateKeycloakUserStatus).toHaveBeenCalledTimes(1); // Only for the allowed user
            });
        });
    });

    describe('/DELETE cron/email-addresses-delete', () => {
        describe(`when is authorized user`, () => {
            it(`should delete non-enabled EmailAddresses which exceed deadline`, async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
                emailAddressDeletionServiceMock.deleteEmailAddresses.mockResolvedValue({ processed: 0, total: 0 });

                await cronController.emailAddressesDelete(permissionsMock);

                expect(emailAddressDeletionServiceMock.deleteEmailAddresses).toHaveBeenCalledTimes(1);
            });
        });
        describe(`when is not authorized user`, () => {
            it(`should NOT delete non-enabled EmailAddresses which exceed deadline and throw an error`, async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(false);

                await expect(cronController.emailAddressesDelete(permissionsMock)).rejects.toBeInstanceOf(
                    MissingPermissionsError,
                );
                expect(emailAddressDeletionServiceMock.deleteEmailAddresses).toHaveBeenCalledTimes(0);
            });
        });
        describe(`when is authorized user but EmailAddressDeleteService throws an Error`, () => {
            it(`should throw the error`, async () => {
                permissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
                const errorMessage: string =
                    'Internal error when trying deleting non-enabled EmailAddresses which exceeded deadline';
                emailAddressDeletionServiceMock.deleteEmailAddresses.mockImplementationOnce(() => {
                    throw new UnknownError(errorMessage);
                });

                await expect(cronController.emailAddressesDelete(permissionsMock)).rejects.toThrow(errorMessage);
            });
        });
    });
});
