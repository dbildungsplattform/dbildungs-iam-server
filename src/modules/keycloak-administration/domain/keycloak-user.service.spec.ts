import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import {
    type CredentialRepresentation,
    type GroupRepresentation,
    KeycloakAdminClient,
    type UserRepresentation,
} from '@s3pweb/keycloak-admin-client-cjs';

import { faker } from '@faker-js/faker';
import { ConfigTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { type DomainError, EntityNotFoundError, KeycloakClientError } from '../../../shared/error/index.js';
import { PersonService } from '../../person/domain/person.service.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { KeycloakAdministrationService } from './keycloak-admin-client.service.js';
import { KeycloakUserService } from './keycloak-user.service.js';
import { type User } from './user.js';
import { UserLock } from './user-lock.js';
import { UserLockRepository } from '../repository/user-lock.repository.js';
import { generatePassword } from '../../../shared/util/password-generator.js';
import { PersonLockOccasion } from '../../person/domain/person.enums.js';
import { Groups } from '@keycloak/keycloak-admin-client/lib/resources/groups.js';
import { Users } from '@keycloak/keycloak-admin-client/lib/resources/users.js';

describe('KeycloakUserService', () => {
    let module: TestingModule;
    let service: KeycloakUserService;
    let adminService: DeepMocked<KeycloakAdministrationService>;
    let adminClient: DeepMocked<KeycloakAdminClient>;
    let kcUsersMock: DeepMocked<Users>;
    let kcGroupsMock: DeepMocked<Groups>;
    let loggerMock: DeepMocked<ClassLogger>;
    let userLockRepository: DeepMocked<UserLockRepository>;

    beforeAll(async () => {
        kcUsersMock = createMock(Users);
        kcGroupsMock = createMock(Groups);

        module = await Test.createTestingModule({
            imports: [ConfigTestModule, LoggingTestModule],
            providers: [
                KeycloakUserService,
                {
                    provide: KeycloakAdministrationService,
                    useValue: createMock<KeycloakAdministrationService>(KeycloakAdministrationService),
                },
                {
                    provide: PersonService,
                    useValue: createMock(PersonService),
                },
                {
                    provide: UserLockRepository,
                    useValue: createMock(UserLockRepository),
                },
            ],
        }).compile();
        service = module.get(KeycloakUserService);
        adminService = module.get(KeycloakAdministrationService);
        loggerMock = module.get(ClassLogger);
        userLockRepository = module.get(UserLockRepository);
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        kcGroupsMock = createMock(Groups, {
            addRealmRoleMappings: () => Promise.resolve(),
            create: () => Promise.resolve({ id: faker.string.uuid() }),
            find: () => Promise.resolve([]),
        });
        kcUsersMock = createMock(Users, {
            addToGroup: () => Promise.resolve('addToGroup called'),
            create: () => Promise.resolve({ id: faker.string.uuid() }),
            del: () => Promise.resolve(),
            delFromGroup: () => Promise.resolve('delFromGroup called'),
            find: () => Promise.resolve([]),
            findOne: () => Promise.resolve(undefined),
            getCredentials: () => Promise.resolve([]),
            listGroups: () => Promise.resolve([]),
            resetPassword: () => Promise.resolve(),
            update: () => Promise.resolve(),
        });
        kcUsersMock.addToGroup.mockResolvedValue('addToGroup called');
        kcUsersMock.find.mockResolvedValue([]);
        kcUsersMock.getCredentials.mockResolvedValue([]);
        kcUsersMock.listGroups.mockResolvedValue([]);
        kcUsersMock.delFromGroup.mockResolvedValue('delFromGroup called');
        kcGroupsMock.find.mockResolvedValue([]);
        kcGroupsMock.create.mockResolvedValue({ id: faker.string.uuid() });
        adminClient = createMock<KeycloakAdminClient>(KeycloakAdminClient);
        (adminClient.groups as unknown as Groups) = kcGroupsMock;
        (adminClient.users as unknown as Users) = kcUsersMock;
        adminService.getAuthedKcAdminClient.mockImplementation(() => {
            return Promise.resolve({
                ok: true,
                value: adminClient,
            });
        });
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createUser', () => {
        describe('when user does not exist', () => {
            it('should return user id', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.create.mockResolvedValueOnce({ id: user.id });

                const res: Result<string> = await service.create({
                    id: undefined,
                    createdDate: undefined,
                    username: user.username,
                    email: user.email,
                    externalSystemIDs: user.externalSystemIDs,
                    enabled: user.enabled,
                });

                expect(res).toStrictEqual<Result<string>>({
                    ok: true,
                    value: user.id,
                });
            });
        });

        describe('when user is created with password', () => {
            it('should call KeycloakAdminClient.users.create with correct props', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const password: string = faker.internet.password();
                kcUsersMock.create.mockResolvedValueOnce({ id: user.id });

                await service.create(
                    {
                        id: undefined,
                        createdDate: undefined,
                        username: user.username,
                        email: user.email,
                        externalSystemIDs: user.externalSystemIDs,
                        enabled: user.enabled,
                    },
                    password,
                );

                expect(kcUsersMock.create).toHaveBeenCalledWith({
                    username: user.username,
                    email: user.email,
                    enabled: true,
                    credentials: [{ type: 'password', value: password, temporary: false }],
                });
            });
        });

        describe('when username and email already exists', () => {
            it('should return error result', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.find.mockResolvedValueOnce([
                    {
                        username: user.username,
                        email: user.email,
                        id: user.id,
                        createdTimestamp: user.createdDate.getTime(),
                        enabled: user.enabled,
                    },
                ]);

                const res: Result<string> = await service.create({
                    id: undefined,
                    createdDate: undefined,
                    username: user.username,
                    email: user.email,
                    externalSystemIDs: user.externalSystemIDs,
                    enabled: user.enabled,
                });

                expect(res).toStrictEqual<Result<string>>({
                    ok: false,
                    error: new KeycloakClientError('Username or email already exists'),
                });
            });
        });

        describe('when user could not be created', () => {
            it('should return error result', async () => {
                kcUsersMock.create.mockRejectedValueOnce(new Error());
                const user: User<false> = DoFactory.createUser(false);

                const res: Result<string> = await service.create(user);

                expect(res).toStrictEqual<Result<string>>({
                    ok: false,
                    error: new KeycloakClientError('Could not create user'),
                });
            });
        });

        describe('when getAuthedKcAdminClient fails', () => {
            it('should pass along error result', async () => {
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);
                const user: User<false> = DoFactory.createUser(false);

                const res: Result<string> = await service.create(user);

                expect(res).toBe(error);
            });
        });
    });

    describe('createUserWithHashedPassword', () => {
        describe('when user does not exist & HashAlgo is Valid BCRYPT', () => {
            it('should return user id', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.create.mockResolvedValueOnce({ id: user.id });

                const res: Result<string> = await service.createWithHashedPassword(
                    {
                        id: undefined,
                        createdDate: undefined,
                        username: user.username,
                        email: user.email,
                        externalSystemIDs: user.externalSystemIDs,
                        enabled: user.enabled,
                    },
                    `{BCRYPT}$2b$12$hqG5T3z8v0Ou8Lmmr2mhW.lNP0DQGO9MS6PQT/CzCJP8Fcx
                    GgKOau`,
                );

                expect(res).toStrictEqual<Result<string>>({
                    ok: true,
                    value: user.id,
                });
            });
        });
        describe('when user does not exist & HashAlgo is Valid CRYPT', () => {
            it('should return user id', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.create.mockResolvedValueOnce({ id: user.id });

                const res: Result<string> = await service.createWithHashedPassword(
                    {
                        id: undefined,
                        createdDate: undefined,
                        username: user.username,
                        email: user.email,
                        externalSystemIDs: user.externalSystemIDs,
                        enabled: user.enabled,
                    },
                    `{crypt}$6$M.L8yO/PSWLRRhe6$CXj2g0wgWhiAnfROIdqJROrgbjmcmin02M1
                    sM1Z25N7H3puT6qlgsDIM.60brf1csn0Zk9GxS8sILpJvmvFi11`,
                );

                expect(res).toStrictEqual<Result<string>>({
                    ok: true,
                    value: user.id,
                });
            });
        });
        describe('when user does not exist & HashAlgo is Invalid BCRYPT', () => {
            it('should return user id', async () => {
                const user: User<true> = DoFactory.createUser(true);

                const res: Result<string> = await service.createWithHashedPassword(
                    {
                        id: undefined,
                        createdDate: undefined,
                        username: user.username,
                        email: user.email,
                        externalSystemIDs: user.externalSystemIDs,
                        enabled: user.enabled,
                    },
                    `{BCRYPT}xxxxxhqG5T3$z8v0Ou8Lmmr2mhW.lNP0DQGO9MS6PQT/CzCJP8Fcx
                    GgKOau`,
                );

                expect(res).toEqual<Result<string>>({
                    ok: false,
                    error: new KeycloakClientError('Invalid bcrypt hash format'),
                });
            });
        });
        describe('when user does not exist & HashAlgo is Invalid crypt', () => {
            it('should return user id', async () => {
                const user: User<true> = DoFactory.createUser(true);

                const res: Result<string> = await service.createWithHashedPassword(
                    {
                        id: undefined,
                        createdDate: undefined,
                        username: user.username,
                        email: user.email,
                        externalSystemIDs: user.externalSystemIDs,
                        enabled: user.enabled,
                    },
                    `{crypt}$$x$$M.L8yO/PSWLRRhe6$CXj2g0wgWhiAnfROIdqJROrgbjmcmin02M1
                    sM1Z25N7H3puT6qlgsDIM.60brf1csn0Zk9GxS8sILpJvmvFi11`,
                );

                expect(res).toEqual<Result<string>>({
                    ok: false,
                    error: new KeycloakClientError('Invalid crypt hash format'),
                });
            });
        });
        describe('when user does not exist & HashAlgo is not supported', () => {
            it('should return user id', async () => {
                const user: User<true> = DoFactory.createUser(true);

                const res: Result<string> = await service.createWithHashedPassword(
                    {
                        id: undefined,
                        createdDate: undefined,
                        username: user.username,
                        email: user.email,
                        externalSystemIDs: user.externalSystemIDs,
                        enabled: user.enabled,
                    },
                    `{notsupported}$6$M.L8yO/PSWLRRhe6$CXj2g0wgWhiAnfROIdqJROrgbjmcmin02M1
                    sM1Z25N7H3puT6qlgsDIM.60brf1csn0Zk9GxS8sILpJvmvFi11`,
                );

                expect(res).toStrictEqual<Result<string>>({
                    ok: false,
                    error: new KeycloakClientError('Unsupported password algorithm'),
                });
            });
        });

        describe('when username and email already exists', () => {
            it('should return error result', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.find.mockResolvedValueOnce([
                    {
                        username: user.username,
                        email: user.email,
                        id: user.id,
                        createdTimestamp: user.createdDate.getTime(),
                        enabled: user.enabled,
                    },
                ]);

                const res: Result<string> = await service.createWithHashedPassword(
                    {
                        id: undefined,
                        createdDate: undefined,
                        username: user.username,
                        email: user.email,
                        externalSystemIDs: user.externalSystemIDs,
                        enabled: user.enabled,
                    },
                    `{BCRYPT}$2b$12$hqG5T3z8v0Ou8Lmmr2mhW.lNP0DQGO9MS6PQT/CzCJP8Fcx
                    GgKOau`,
                );

                expect(res).toStrictEqual<Result<string>>({
                    ok: false,
                    error: new KeycloakClientError('Username or email already exists'),
                });
            });
        });

        describe('when user could not be created', () => {
            it('should return error result', async () => {
                kcUsersMock.find.mockResolvedValueOnce([
                    {
                        username: faker.string.alphanumeric(),
                        email: faker.string.alphanumeric(),
                        id: faker.string.uuid(),
                        createdTimestamp: faker.date.recent(),
                    },
                ] as unknown as UserRepresentation[]);
                const user: User<false> = DoFactory.createUser(false);
                kcUsersMock.create.mockRejectedValueOnce(new Error());

                const res: Result<string> = await service.createWithHashedPassword(
                    user,
                    `{BCRYPT}$2b$12$hqG5T3z8v0Ou8Lmmr2mhW.lNP0DQGO9MS6PQT/CzCJP8Fcx
                    GgKOau`,
                );

                expect(res).toEqual<Result<string>>({
                    ok: false,
                    error: new KeycloakClientError('Could not create user'),
                });
            });
        });

        describe('when getAuthedKcAdminClient fails', () => {
            it('should pass along error result', async () => {
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);
                const user: User<false> = DoFactory.createUser(false);

                const res: Result<string> = await service.createWithHashedPassword(
                    user,
                    `{BCRYPT}$2b$12$hqG5T3z8v0Ou8Lmmr2mhW.lNP0DQGO9MS6PQT/CzCJP8Fcx
                    GgKOau`,
                );

                expect(res).toBe(error);
            });
        });
    });

    describe('delete', () => {
        it('should return ok result if user exists', async () => {
            kcUsersMock.del.mockResolvedValueOnce();

            const result: Result<void> = await service.delete(faker.string.uuid());

            expect(result).toStrictEqual<Result<void>>({
                ok: true,
                value: undefined,
            });
        });

        it('should return error result if client.users.del throws', async () => {
            kcUsersMock.del.mockRejectedValueOnce(new Error('User does not exist'));

            const result: Result<void, DomainError> = await service.delete(faker.string.uuid());

            const expectedError: Result<void> = {
                ok: false,
                error: new KeycloakClientError('Keycloak request failed', {
                    details: [new Error('User does not exist')],
                }),
            };
            expect(result.ok).toBeFalsy();
            if (!result.ok) {
                expect(result.error.message).toBe(expectedError.error.message);
                expect(result.error).toBeInstanceOf(KeycloakClientError);
            }
        });

        it('should return error result of getAuthedKcAdminClient', async () => {
            const error: Result<KeycloakAdminClient, DomainError> = {
                ok: false,
                error: new KeycloakClientError('Could not authenticate'),
            };
            adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);

            const result: Result<void> = await service.delete(faker.string.uuid());

            expect(result).toBe(error);
        });
    });

    describe('findById', () => {
        describe('when user exists', () => {
            it('should return result with User', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    username: user.username,
                    email: user.email,
                    id: user.id,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: user.enabled,
                });

                const res: Result<User<true>> = await service.findById(user.id);

                expect(res).toStrictEqual<Result<User<true>>>({
                    ok: true,
                    value: user,
                });
            });
        });

        describe('when user does not exist', () => {
            it('should return error result', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce(undefined);

                const res: Result<User<true>> = await service.findById(user.id);

                expect(res).toStrictEqual<Result<User<true>>>({
                    ok: false,
                    error: new EntityNotFoundError(`Keycloak User with the following ID ${user.id} does not exist`),
                });
            });
        });

        describe('when getAuthedKcAdminClient fails', () => {
            it('should pass along error result', async () => {
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);
                const user: User<true> = DoFactory.createUser(true);

                const res: Result<User<true>> = await service.findById(user.id);

                expect(res).toBe(error);
            });
        });

        describe('when KeycloakAdminClient throws', () => {
            it('should return error result', async () => {
                kcUsersMock.findOne.mockRejectedValueOnce(new Error());
                const user: User<true> = DoFactory.createUser(true);

                const result: Result<User<true>, DomainError> = await service.findById(user.id);
                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error.message).toBe('Keycloak request failed');
                    expect(result.error).toBeInstanceOf(KeycloakClientError);
                }
            });
        });

        describe('when KeycloakAdminClient.findOne returns invalid data', () => {
            it('should return error result', async () => {
                kcUsersMock.findOne.mockResolvedValueOnce({
                    username: 'TEST',
                });
                const user: User<true> = DoFactory.createUser(true);

                const res: Result<User<true>> = await service.findById(user.id);

                expect(res).toStrictEqual<Result<User<true>>>({
                    ok: false,
                    error: new KeycloakClientError('Response is invalid'),
                });
            });
        });
    });

    describe('findOne', () => {
        describe('when user exists', () => {
            it('should return result with User', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.find.mockResolvedValueOnce([
                    {
                        username: user.username,
                        email: user.email,
                        id: user.id,
                        createdTimestamp: user.createdDate.getTime(),
                        enabled: user.enabled,
                    },
                ]);

                const res: Result<User<true>> = await service.findOne({
                    username: user.username,
                    email: user.email,
                });

                expect(res).toStrictEqual<Result<User<true>>>({
                    ok: true,
                    value: user,
                });
            });
        });

        describe('when user does not exist', () => {
            it('should return error result', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.find.mockResolvedValueOnce([]);

                const res: Result<User<true>> = await service.findOne({
                    username: user.username,
                    email: user.email,
                });

                expect(res).toStrictEqual<Result<User<true>>>({
                    ok: false,
                    error: new EntityNotFoundError('Keycloak User could not be found'),
                });
            });
        });

        describe('when getAuthedKcAdminClient fails', () => {
            it('should pass along error result', async () => {
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);
                const user: User<true> = DoFactory.createUser(true);

                const res: Result<User<true>> = await service.findOne({
                    username: user.username,
                    email: user.email,
                });

                expect(res).toBe(error);
            });
        });

        describe('when KeycloakAdminClient throws', () => {
            it('should return error result', async () => {
                kcUsersMock.find.mockRejectedValueOnce(new Error());
                const user: User<true> = DoFactory.createUser(true);
                const result: Result<User<true>> = await service.findOne({
                    username: user.username,
                    email: user.email,
                });

                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error.message).toBe('Keycloak request failed');
                    expect(result.error).toBeInstanceOf(KeycloakClientError);
                }
            });
        });
    });

    describe('setPassword', () => {
        describe('will be executed successfully', () => {
            describe('if password is temporary', () => {
                it('should return result with ok:true and new temporary password', async () => {
                    const userId: string = faker.string.numeric();
                    const generatedPassword: string = generatePassword();
                    kcUsersMock.resetPassword.mockResolvedValueOnce();

                    const result: Result<string, DomainError> = await service.setPassword(userId, generatedPassword);

                    expect(result).toStrictEqual({
                        ok: true,
                        value: generatedPassword,
                    });
                    expect(kcUsersMock.resetPassword).toHaveBeenCalledWith({
                        id: userId,
                        credential: {
                            temporary: true,
                            type: 'password',
                            value: generatedPassword,
                        },
                    });
                });
            });
            describe('if password is permanent', () => {
                it('should return result with ok:true and new permanent password', async () => {
                    const userId: string = faker.string.numeric();
                    const generatedPassword: string = generatePassword();
                    kcUsersMock.resetPassword.mockResolvedValueOnce();

                    const result: Result<string, DomainError> = await service.setPassword(
                        userId,
                        generatedPassword,
                        false,
                    );

                    expect(result).toStrictEqual({
                        ok: true,
                        value: generatedPassword,
                    });
                    expect(kcUsersMock.resetPassword).toHaveBeenCalledWith({
                        id: userId,
                        credential: {
                            temporary: false,
                            type: 'password',
                            value: generatedPassword,
                        },
                    });
                });
            });
        });
        describe('when error is thrown during password-reset', () => {
            it('should pass error', async () => {
                const userId: string = faker.string.numeric();
                const generatedPassword: string = generatePassword();
                kcUsersMock.resetPassword.mockRejectedValueOnce(new Error());
                const result: Result<string, DomainError> = await service.setPassword(userId, generatedPassword);
                expect(result).toStrictEqual({
                    ok: false,
                    error: new KeycloakClientError('Could not authorize with Keycloak'),
                });
            });
        });
        describe('when error thrown by getAuthedKcAdminClient', () => {
            it('should pass error', async () => {
                const userId: string = faker.string.numeric();
                const generatedPassword: string = faker.lorem.word();
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };
                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);
                const result: Result<string, DomainError> = await service.setPassword(userId, generatedPassword);
                expect(result).toStrictEqual({
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                });
            });
        });
    });
    describe('assignRealmGroupsToUser', () => {
        describe('getAuthedKcAdminClient is not ok ', () => {
            it('should return a DomainError', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                kcUsersMock.create.mockResolvedValueOnce({ id: user.id });
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);

                const res: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, [rolle.name]);

                expect(res).toBe(error);
            });
        });
        describe('when user does not exist', () => {
            it('should return error when findById fails', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const rolle2: Rolle<true> = DoFactory.createRolle(true);
                kcUsersMock.findOne.mockResolvedValueOnce(undefined);
                const roleNames: string[] = [rolle.name, rolle2.name];

                const result: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, roleNames);

                expect(result).toStrictEqual<Result<User<true>>>({
                    ok: false,
                    error: new EntityNotFoundError(`Keycloak User with the following ID ${user.id} does not exist`),
                });
            });
        });
        describe('when user exists', () => {
            it('should return user', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const roleNames: string[] = ['group1', 'group2'];

                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [
                    {
                        id: 'group-id-1',
                        name: 'group1',
                    },
                    {
                        id: 'group-id-2',
                        name: 'group2',
                    },
                ];
                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);

                kcUsersMock.listGroups.mockResolvedValueOnce([]);

                kcUsersMock.addToGroup.mockResolvedValueOnce('group-id-1');
                kcUsersMock.addToGroup.mockResolvedValueOnce('group-id-2');

                const result: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, roleNames);

                expect(result).toStrictEqual<Result<void>>({
                    ok: true,
                    value: undefined,
                });
            });
        });
        describe('when no valid roles found', () => {
            it('should return an error', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                kcGroupsMock.find.mockResolvedValueOnce([]);

                const result: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, [
                    'non-existing-role',
                ]);

                expect(result).toStrictEqual<Result<void>>({
                    ok: false,
                    error: new EntityNotFoundError(`No valid groups found for the provided group names`),
                });
            });
        });
        describe('when user already has all roles', () => {
            it('should return ok without assigning new roles', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [
                    { id: 'group-id-1', name: 'group1' },
                    { id: 'group-id-2', name: 'group2' },
                ];
                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);

                kcUsersMock.listGroups.mockResolvedValueOnce(mockGroups);
                const result: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, [
                    'group1',
                    'group2',
                ]);

                expect(result).toStrictEqual<Result<void>>({ ok: true, value: undefined });
            });
        });
        describe('when no roles are provided', () => {
            it('should return ok without making any changes', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });
                const mockGroups: GroupRepresentation[] = [
                    { id: 'group-id-1', name: 'group1' },
                    { id: 'group-id-2', name: 'group2' },
                ];
                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);

                const result: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, []);

                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(EntityNotFoundError);
                }
            });
        });

        describe('when some roles are not valid', () => {
            it('should only assign the valid roles', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [{ id: 'group-id-1', name: 'group1' }];

                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);
                kcUsersMock.listGroups.mockResolvedValueOnce([]);
                kcUsersMock.addToGroup.mockResolvedValueOnce('group-id-1');

                const result: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, [
                    'group1',
                    'invalid-group',
                ]);

                expect(result).toStrictEqual<Result<void>>({ ok: true, value: undefined });
                expect(kcUsersMock.addToGroup).toHaveBeenCalledWith({
                    id: user.id,
                    groupId: 'group-id-1',
                });
                // Assert that only the valid group was passed to addToGroup
                expect(kcUsersMock.addToGroup).not.toHaveBeenCalledWith({
                    id: user.id,
                    groupId: 'invalid-group',
                });
            });
        });
        describe('when an error occurs during group assignment', () => {
            it('should log the error and return a DomainError', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const groupNames: string[] = ['group1', 'group2'];

                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [
                    { id: 'group-id-1', name: 'group1' },
                    { id: 'group-id-2', name: 'group2' },
                ];
                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);

                kcUsersMock.listGroups.mockResolvedValueOnce([]);

                const error: Error = new Error('Simulated error during group assignment');
                kcUsersMock.addToGroup.mockRejectedValueOnce(error);

                const result: Result<void, DomainError> = await service.assignRealmGroupsToUser(user.id, groupNames);

                expect(loggerMock.error).toHaveBeenCalledWith(
                    expect.stringContaining(`Failed to assign groups for user ${user.id}`),
                    error,
                );

                expect(result).toStrictEqual({
                    ok: false,
                    error: new KeycloakClientError('Failed to assign groups'),
                });
            });
        });
    });
    describe('removeRealmGroupsFromUser', () => {
        describe('getAuthedKcAdminClient is not ok', () => {
            it('should return a DomainError', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                kcUsersMock.create.mockResolvedValueOnce({ id: user.id });
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);

                const res: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, [rolle.name]);

                expect(res).toBe(error);
            });
        });

        describe('when user does not exist', () => {
            it('should return error when findById fails', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const rolle: Rolle<true> = DoFactory.createRolle(true);
                const rolle2: Rolle<true> = DoFactory.createRolle(true);
                kcUsersMock.findOne.mockResolvedValueOnce(undefined);
                const groupNames: string[] = [rolle.name, rolle2.name];

                const result: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, groupNames);

                expect(result).toStrictEqual<Result<User<true>>>({
                    ok: false,
                    error: new EntityNotFoundError(`Keycloak User with the following ID ${user.id} does not exist`),
                });
            });
        });

        describe('when user exists', () => {
            it('should return ok after removing groups', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const groupNames: string[] = ['group1', 'group2'];

                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [
                    {
                        id: 'group-id-1',
                        name: 'group1',
                    },
                    {
                        id: 'group-id-2',
                        name: 'group2',
                    },
                ];
                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);

                kcUsersMock.listGroups.mockResolvedValueOnce(mockGroups);

                kcUsersMock.delFromGroup.mockResolvedValueOnce('group-id-1');
                kcUsersMock.delFromGroup.mockResolvedValueOnce('group-id-2');

                const result: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, groupNames);

                expect(result).toStrictEqual<Result<void>>({
                    ok: true,
                    value: undefined,
                });
            });
        });

        describe('when no valid roles found', () => {
            it('should return an error', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                kcGroupsMock.find.mockResolvedValueOnce([]);

                const result: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, [
                    'non-existing-role',
                ]);

                expect(result).toStrictEqual<Result<void>>({
                    ok: false,
                    error: new EntityNotFoundError(`No valid groups found for the provided group names`),
                });
            });
        });

        describe('when user does not have the roles', () => {
            it('should return ok without removing any roles', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [
                    { id: 'group-id-1', name: 'group1' },
                    { id: 'group-id-2', name: 'group2' },
                ];
                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);
                kcUsersMock.listGroups.mockResolvedValueOnce([]);

                const result: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, [
                    'group1',
                    'group2',
                ]);

                expect(result).toStrictEqual<Result<void>>({ ok: true, value: undefined });
            });
        });

        describe('when no roles are provided', () => {
            it('should return ok without making any changes', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });
                const mockGroups: GroupRepresentation[] = [
                    { id: 'group-id-1', name: 'group1' },
                    { id: 'group-id-2', name: 'group2' },
                ];
                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);

                const result: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, []);

                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error).toBeInstanceOf(EntityNotFoundError);
                }
            });
        });

        describe('when some groups are not valid', () => {
            it('should only remove the valid groups', async () => {
                const user: User<true> = DoFactory.createUser(true);
                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [{ id: 'group-id-1', name: 'group1' }];

                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);
                kcUsersMock.listGroups.mockResolvedValueOnce(mockGroups);
                kcUsersMock.delFromGroup.mockResolvedValueOnce('group-id-1');

                const result: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, [
                    'group1',
                    'invalid-group',
                ]);

                expect(result).toStrictEqual<Result<void>>({ ok: true, value: undefined });
                // Assert that only the valid role was passed to delFromGroup
                expect(kcUsersMock.delFromGroup).toHaveBeenCalledWith({
                    id: user.id,
                    groupId: 'group-id-1',
                });
            });
        });

        describe('when an error occurs during group removal', () => {
            it('should log the error and return a DomainError', async () => {
                const user: User<true> = DoFactory.createUser(true);
                const groupNames: string[] = ['group1', 'group2'];

                kcUsersMock.findOne.mockResolvedValueOnce({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    createdTimestamp: user.createdDate.getTime(),
                    enabled: true,
                });

                const mockGroups: GroupRepresentation[] = [{ id: 'group-id-1', name: 'group1' }];

                kcGroupsMock.find.mockResolvedValueOnce(mockGroups);
                kcUsersMock.listGroups.mockResolvedValueOnce(mockGroups);

                const error: Error = new Error('Simulated error during group removal');
                kcUsersMock.delFromGroup.mockRejectedValueOnce(error);

                const result: Result<void, DomainError> = await service.removeRealmGroupsFromUser(user.id, groupNames);

                expect(loggerMock.error).toHaveBeenCalled();
                expect(result).toStrictEqual<Result<void>>({
                    ok: false,
                    error: new KeycloakClientError('Failed to remove groups'),
                });
            });
        });
        describe('updateKeycloakUserStatus', () => {
            const userLock: UserLock = {
                person: '1',
                locked_by: 'test',
                locked_until: new Date(),
                created_at: new Date(),
                locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
            };
            it('should create user lock successfully', async () => {
                adminClient.users.update.mockResolvedValueOnce(undefined);
                const userLocks: UserLock[] = [];
                userLockRepository.findByPersonId.mockResolvedValueOnce(userLocks);

                const result: Result<void, DomainError> = await service.updateKeycloakUserStatus(
                    'person-id',
                    'user-id',
                    userLock,
                    true,
                );
                expect(result).toStrictEqual({ ok: true, value: undefined });
                expect(adminClient.users.update).toHaveBeenCalledWith({ id: 'user-id' }, { enabled: false });
            });
            it('should update existing user lock successfully', async () => {
                adminClient.users.update.mockResolvedValueOnce(undefined);
                const manualUserLock: UserLock = userLock;
                const userLocks: UserLock[] = [manualUserLock];
                userLockRepository.findByPersonId.mockResolvedValueOnce(userLocks);
                userLockRepository.update.mockResolvedValueOnce(manualUserLock);

                const result: Result<void, DomainError> = await service.updateKeycloakUserStatus(
                    'person-id',
                    'user-id',
                    userLock,
                    true,
                );
                expect(result).toStrictEqual({ ok: true, value: undefined });
                expect(adminClient.users.update).toHaveBeenCalledWith({ id: 'user-id' }, { enabled: false });
            });
            it('should unlock user successfully', async () => {
                adminClient.users.update.mockResolvedValueOnce(undefined);
                userLockRepository.deleteUserLock.mockResolvedValueOnce(undefined);
                userLockRepository.findByPersonId.mockResolvedValueOnce([]);

                const result: Result<void, DomainError> = await service.updateKeycloakUserStatus(
                    'person-id',
                    'user-id',
                    userLock,
                    false,
                );
                expect(result).toStrictEqual({ ok: true, value: undefined });
                expect(adminClient.users.update).toHaveBeenCalledWith({ id: 'user-id' }, { enabled: true });
            });
            it('should return error if update fails', async () => {
                adminClient.users.update.mockRejectedValueOnce(new Error('Update failed'));

                const lockMock: UserLock = UserLock.construct(
                    faker.string.uuid(),
                    faker.string.uuid(),
                    faker.date.future(),
                    PersonLockOccasion.MANUELL_GESPERRT,
                    faker.date.recent(),
                );
                const result: Result<void, DomainError> = await service.updateKeycloakUserStatus(
                    'person-id',
                    'user-id',
                    lockMock,
                    true,
                );

                expect(result).toStrictEqual({
                    ok: false,
                    error: new KeycloakClientError('Could not update user status or database'),
                });
            });

            it('should return error if getAuthedKcAdminClient fails', async () => {
                adminService.getAuthedKcAdminClient.mockResolvedValueOnce({
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                });

                const lockMock: UserLock = UserLock.construct(
                    faker.string.uuid(),
                    faker.string.uuid(),
                    faker.date.future(),
                    PersonLockOccasion.MANUELL_GESPERRT,
                    faker.date.recent(),
                );
                const result: Result<void, DomainError> = await service.updateKeycloakUserStatus(
                    'person-id',
                    'user-id',
                    lockMock,
                    true,
                );

                expect(result).toStrictEqual({
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                });
            });
        });
    });

    describe('getKeyCloakUserData', () => {
        const userId: string = 'userid';
        describe('when getAuthedKcAdminClient fails', () => {
            it('should return', async () => {
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);
                const actual: UserRepresentation | undefined = await service.getKeyCloakUserData(userId);
                expect(actual).toBeUndefined();
            });
        });
        describe('when retrieval from keycloak', () => {
            describe('succeeds', () => {
                it('should return UserRepresentation', async () => {
                    kcUsersMock.findOne.mockImplementationOnce((payload?: { id: string; realm?: string }) => {
                        return Promise.resolve({ id: payload?.id });
                    });

                    const actual: UserRepresentation | undefined = await service.getKeyCloakUserData(userId);
                    expect(actual).toEqual({ id: userId });
                });
            });
            describe('fails', () => {
                it('should return', async () => {
                    kcUsersMock.findOne.mockRejectedValueOnce(new Error('Retrieval failed'));

                    const actual: UserRepresentation | undefined = await service.getKeyCloakUserData(userId);
                    expect(adminClient.users.findOne).toHaveBeenCalledWith({ id: userId });
                    expect(actual).toBeUndefined();
                });
            });
        });
    });

    describe('getLastPasswordChange', () => {
        const userCreationTimestamp: number = faker.date.past().valueOf();
        const mockUser: UserRepresentation = { id: faker.string.uuid(), createdTimestamp: userCreationTimestamp };
        describe('when the password has been updated', () => {
            const updatedAt: Date = new Date();
            const mockCredentials: Array<CredentialRepresentation> = [
                { type: 'password', createdDate: updatedAt.valueOf() },
                { type: 'other', createdDate: faker.date.past().valueOf() },
            ];
            it('should return the timestamp', async () => {
                kcUsersMock.findOne.mockResolvedValueOnce(mockUser);
                kcUsersMock.getCredentials.mockResolvedValueOnce(mockCredentials);
                const result: Result<Date, DomainError> = await service.getLastPasswordChange(mockUser.id!);
                expect(result).toStrictEqual({
                    ok: true,
                    value: updatedAt,
                });
            });
        });
        describe('when the credential request fails', () => {
            it('should return an error', async () => {
                kcUsersMock.findOne.mockResolvedValueOnce(mockUser);
                kcUsersMock.getCredentials.mockRejectedValueOnce({});
                const result: Result<Date, DomainError> = await service.getLastPasswordChange(mockUser.id!);
                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error.message).toBe('Keycloak request failed');
                    expect(result.error).toBeInstanceOf(KeycloakClientError);
                }
            });
        });

        describe('when the password has not been updated', () => {
            it('should return an error', async () => {
                const updatedAt: number = mockUser.createdTimestamp!;
                const mockCredentials: Array<CredentialRepresentation> = [
                    { type: 'password', createdDate: updatedAt },
                    { type: 'other', createdDate: faker.date.past().valueOf() },
                ];
                kcUsersMock.findOne.mockResolvedValueOnce(mockUser);
                kcUsersMock.getCredentials.mockResolvedValueOnce(mockCredentials);
                const result: Result<Date, DomainError> = await service.getLastPasswordChange(mockUser.id!);
                expect(result).toStrictEqual({
                    ok: false,
                    error: new KeycloakClientError('Keycloak user password has never been updated'),
                });
            });
        });
        describe('when the user does not exist', () => {
            const updatedAt: number = mockUser.createdTimestamp!;
            const mockCredentials: Array<CredentialRepresentation> = [
                { type: 'password', createdDate: updatedAt },
                { type: 'other', createdDate: faker.date.past().valueOf() },
            ];
            it('should return an error', async () => {
                kcUsersMock.findOne.mockRejectedValueOnce(null);
                kcUsersMock.getCredentials.mockResolvedValueOnce(mockCredentials);
                const result: Result<Date, DomainError> = await service.getLastPasswordChange(mockUser.id!);
                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error.message).toBe('Keycloak request failed');
                    expect(result.error).toBeInstanceOf(KeycloakClientError);
                }
            });
        });
        describe('when the user does not have a proper timestamp', () => {
            const updatedAt: number = mockUser.createdTimestamp!;
            const brokenUser: UserRepresentation = { id: faker.string.uuid() };
            const mockCredentials: Array<CredentialRepresentation> = [
                { type: 'password', createdDate: updatedAt },
                { type: 'other', createdDate: faker.date.past().valueOf() },
            ];
            it('should return an error', async () => {
                kcUsersMock.findOne.mockResolvedValueOnce(brokenUser);
                kcUsersMock.getCredentials.mockResolvedValueOnce(mockCredentials);
                const result: Result<Date, DomainError> = await service.getLastPasswordChange(mockUser.id!);
                expect(result).toStrictEqual({
                    ok: false,
                    error: new KeycloakClientError('Keycloak user has no createdTimestamp'),
                });
            });
        });
        describe('when something is wrong with the credentials', () => {
            const data: Array<{ credentials: Array<CredentialRepresentation>; error: string }> = [
                { credentials: [], error: 'Keycloak returned no credentials' },
                { credentials: [{ type: 'other' }], error: 'Keycloak user has no password' },
                { credentials: [{ type: 'password' }], error: 'Keycloak user password has no createdDate' },
                {
                    credentials: [{ type: 'password', createdDate: userCreationTimestamp }],
                    error: 'Keycloak user password has never been updated',
                },
            ];
            beforeEach(() => {
                kcUsersMock.findOne.mockReset();
                kcUsersMock.getCredentials.mockReset();
            });
            it.each(data)(
                'should return an error',
                async ({ credentials, error }: { credentials: Array<CredentialRepresentation>; error: string }) => {
                    kcUsersMock.findOne.mockResolvedValueOnce(mockUser);
                    kcUsersMock.getCredentials.mockResolvedValueOnce(credentials);
                    const result: Result<Date, DomainError> = await service.getLastPasswordChange(mockUser.id!);
                    expect(result).toStrictEqual({
                        ok: false,
                        error: new KeycloakClientError(error),
                    });
                },
            );
        });

        describe('when getAuthedKcAdminClient fails', () => {
            it('should pass along error result', async () => {
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);
                const res: Result<Date, DomainError> = await service.getLastPasswordChange(faker.string.uuid());

                expect(res).toBe(error);
            });
        });
    });

    describe('updateUsername', () => {
        let username: string;
        let newUsername: string;

        beforeEach(() => {
            username = faker.internet.username();
            newUsername = faker.internet.username();
        });

        describe('when user does not exist', () => {
            it('should return error', async () => {
                kcUsersMock.find.mockRejectedValueOnce(new Error());

                const res: Result<void, DomainError> = await service.updateUsername(username, newUsername);

                expect(res.ok).toBeFalsy();
            });
        });

        describe('when user exists but id is undefined', () => {
            it('should return error', async () => {
                kcUsersMock.find.mockResolvedValueOnce([
                    {
                        username: faker.string.alphanumeric(),
                        email: faker.internet.email(),
                        createdTimestamp: faker.date.recent().getTime(),
                    },
                ]);

                const res: Result<void, DomainError> = await service.updateUsername(username, newUsername);

                expect(res.ok).toBeFalsy();
            });
        });

        describe('when find returns array with undefined first element', () => {
            it('should return error', async () => {
                kcUsersMock.find.mockResolvedValueOnce([]);

                const res: Result<void, DomainError> = await service.updateUsername(username, newUsername);

                expect(res.ok).toBeFalsy();
            });
        });

        describe('when updating user is successful', () => {
            it('should return undefined and no errors', async () => {
                const kcId: string = faker.string.uuid();
                kcUsersMock.find.mockResolvedValueOnce([
                    {
                        username: faker.string.alphanumeric(),
                        email: faker.internet.email(),
                        id: kcId,
                        createdTimestamp: faker.date.recent().getTime(),
                    },
                ]);

                kcUsersMock.update.mockResolvedValueOnce();

                const res: Result<void, DomainError> = await service.updateUsername(username, newUsername);

                expect(res).toEqual({
                    ok: true,
                    value: undefined,
                });
                expect(kcUsersMock.find).toHaveBeenCalledWith({ username: username, exact: true });
                expect(kcUsersMock.update).toHaveBeenCalledWith({ id: kcId }, { username: newUsername });
            });
        });

        describe('when user could not be updated', () => {
            it('should return error result', async () => {
                const kcId: string = faker.string.uuid();
                kcUsersMock.find.mockResolvedValueOnce([
                    {
                        username: faker.string.alphanumeric(),
                        email: faker.internet.email(),
                        id: kcId,
                        createdTimestamp: faker.date.recent().getTime(),
                    },
                ]);
                const kcError: DomainError = new KeycloakClientError('Could not update username');
                kcUsersMock.update.mockRejectedValueOnce(kcError);

                const res: Result<void, DomainError> = await service.updateUsername(username, newUsername);

                expect(res).toStrictEqual<Result<void>>({
                    ok: false,
                    error: kcError,
                });
                expect(kcUsersMock.find).toHaveBeenCalledWith({ username: username, exact: true });
                expect(kcUsersMock.update).toHaveBeenCalledWith({ id: kcId }, { username: newUsername });
            });
        });

        describe('when user does not exist', () => {
            it('should return EntityNotFoundError', async () => {
                const kcError: DomainError = new KeycloakClientError('Keycloak request failed');
                kcUsersMock.find.mockRejectedValueOnce(kcError);

                const result: Result<void, DomainError> = await service.updateUsername(username, newUsername);

                expect(kcUsersMock.find).toHaveBeenCalledWith({ username: username, exact: true });
                expect(result.ok).toBeFalsy();
                if (!result.ok) {
                    expect(result.error.message).toBe('Keycloak request failed');
                    expect(result.error).toBeInstanceOf(KeycloakClientError);
                }
            });
        });

        describe('when getAuthedKcAdminClient fails', () => {
            it('should pass along error result', async () => {
                const error: Result<KeycloakAdminClient, DomainError> = {
                    ok: false,
                    error: new KeycloakClientError('Could not authenticate'),
                };

                adminService.getAuthedKcAdminClient.mockResolvedValueOnce(error);

                const res: Result<void, DomainError> = await service.updateUsername(username, newUsername);

                expect(res).toBe(error);
                expect(kcUsersMock.find).not.toHaveBeenCalledWith({ username: username, exact: true });
            });
        });
    });
});
