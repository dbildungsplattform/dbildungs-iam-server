import { Injectable } from '@nestjs/common';
import {
    CredentialRepresentation,
    KeycloakAdminClient,
    type UserRepresentation,
} from '@s3pweb/keycloak-admin-client-cjs';
import { plainToClass } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError, EntityNotFoundError, KeycloakClientError } from '../../../shared/error/index.js';
import { KeycloakAdministrationService } from './keycloak-admin-client.service.js';
import { UserRepresentationDto } from './keycloak-client/user-representation.dto.js';
import { User } from './user.js';
import { UserLockRepository } from '../repository/user-lock.repository.js';
import { UserLock } from './user-lock.js';
import { PersonLockOccasion } from '../../person/domain/person.enums.js';

export type FindUserFilter = {
    username?: string;
    email?: string;
};

@Injectable()
export class KeycloakUserService {
    public constructor(
        private readonly kcAdminService: KeycloakAdministrationService,
        private readonly logger: ClassLogger,
        private readonly userLockRepository: UserLockRepository,
    ) {}

    public async create(user: User<false>, password?: string): Promise<Result<string, DomainError>> {
        // Get authed client
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        // Check for existing user
        const filter: FindUserFilter = {
            username: user.username,
        };

        if (user.email) {
            filter.email = user.email;
        }

        const findResult: Result<User<true>, DomainError> = await this.findOne(filter);

        if (findResult.ok) {
            return {
                ok: false,
                error: new KeycloakClientError('Username or email already exists'),
            };
        }

        // Create user
        try {
            const userRepresentation: UserRepresentation = {
                username: user.username,
                enabled: true,
            };

            if (user.email) {
                userRepresentation.email = user.email;
            }

            if (password) {
                userRepresentation.credentials = [{ type: 'password', value: password, temporary: false }];
            }

            const response: { id: string } = await kcAdminClientResult.value.users.create(userRepresentation);

            return { ok: true, value: response.id };
        } catch (err) {
            this.logger.logUnknownAsError('Could not create User', err);
            return { ok: false, error: new KeycloakClientError('Could not create user') };
        }
    }

    public async createWithHashedPassword(
        user: User<false>,
        hashedPassword: string,
    ): Promise<Result<string, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }
        let algorithm: string;
        let hashIterations: number | undefined;
        let passwordValue: string;
        if (hashedPassword.startsWith('{BCRYPT}')) {
            algorithm = 'bcrypt';
            const parts: string[] = hashedPassword.split('$'); //Only Everything After and including the First $
            if (parts.length < 4 || !parts[2]) {
                return {
                    ok: false,
                    error: new KeycloakClientError('Invalid bcrypt hash format'),
                };
            }
            hashIterations = parseInt(parts[2]);
            passwordValue = hashedPassword.substring(hashedPassword.indexOf('$'));
        } else if (hashedPassword.startsWith('{crypt}')) {
            algorithm = 'crypt';
            const parts: string[] = hashedPassword.split('$');
            if (parts.length < 4 || !parts[1] || !parts[2]) {
                return {
                    ok: false,
                    error: new KeycloakClientError('Invalid crypt hash format'),
                };
            }
            hashIterations = undefined;
            passwordValue = hashedPassword.substring(hashedPassword.indexOf('$'));
        } else {
            return {
                ok: false,
                error: new KeycloakClientError('Unsupported password algorithm'),
            };
        }

        // Check for existing user
        const filter: FindUserFilter = {
            username: user.username,
        };

        if (user.email) {
            filter.email = user.email;
        }

        const findResult: Result<User<true>, DomainError> = await this.findOne(filter);

        if (findResult.ok) {
            return {
                ok: false,
                error: new KeycloakClientError('Username or email already exists'),
            };
        }

        //credentialData & secretData are stringified, otherwiese KC wont accept it
        try {
            const userRepresentation: UserRepresentation = {
                username: user.username,
                enabled: true,
                credentials: [
                    {
                        credentialData: JSON.stringify({
                            hashIterations: hashIterations,
                            algorithm: algorithm,
                        }),
                        secretData: JSON.stringify({
                            value: passwordValue,
                        }),
                        type: 'password',
                        temporary: true,
                    },
                ],
            };

            const response: { id: string } = await kcAdminClientResult.value.users.create(userRepresentation);

            return { ok: true, value: response.id };
        } catch (err) {
            this.logger.logUnknownAsError('Could not create User', err);
            return { ok: false, error: new KeycloakClientError('Could not create user') };
        }
    }

    public async delete(id: string): Promise<Result<void, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        return this.wrapClientResponse(kcAdminClientResult.value.users.del({ id }));
    }

    public async findById(id: string): Promise<Result<User<true>, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        const userResult: Result<Option<UserRepresentation>, DomainError> = await this.wrapClientResponse(
            kcAdminClientResult.value.users.findOne({ id }),
        );
        if (!userResult.ok) {
            return userResult;
        }
        if (userResult.value) {
            return this.mapResponseToDto(userResult.value);
        }

        return {
            ok: false,
            error: new EntityNotFoundError(`Keycloak User with the following ID ${id} does not exist`),
        };
    }

    public async findOne(filter: FindUserFilter): Promise<Result<User<true>, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        const userResult: Result<UserRepresentation[], DomainError> = await this.wrapClientResponse(
            kcAdminClientResult.value.users.find({ ...filter, exact: true }),
        );
        if (!userResult.ok) {
            return userResult;
        }

        if (userResult.value.length === 1) {
            return this.mapResponseToDto(userResult.value[0]);
        }

        return {
            ok: false,
            error: new EntityNotFoundError(`Keycloak User could not be found`),
        };
    }

    public async setPassword(
        userId: string,
        password: string,
        temporary: boolean = true,
    ): Promise<Result<string, DomainError>> {
        try {
            // Get authed client
            const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
                await this.kcAdminService.getAuthedKcAdminClient();
            if (!kcAdminClientResult.ok) {
                return kcAdminClientResult;
            }
            await kcAdminClientResult.value.users.resetPassword({
                id: userId,
                credential: {
                    temporary: temporary,
                    type: 'password',
                    value: password,
                },
            });
            return { ok: true, value: password };
        } catch (err) {
            this.logger.logUnknownAsError('Could not authorize with Keycloak', err);
            return { ok: false, error: new KeycloakClientError('Could not authorize with Keycloak') };
        }
    }

    public async getLastPasswordChange(userId: string): Promise<Result<Date, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();
        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        const userResult: Result<Option<UserRepresentation>, DomainError> = await this.wrapClientResponse(
            kcAdminClientResult.value.users.findOne({ id: userId }),
        );
        if (!userResult.ok) {
            return userResult;
        }
        if (!userResult.value?.createdTimestamp) {
            return { ok: false, error: new KeycloakClientError('Keycloak user has no createdTimestamp') };
        }

        const credentialsResult: Result<
            Option<Array<CredentialRepresentation>>,
            DomainError
        > = await this.wrapClientResponse(kcAdminClientResult.value.users.getCredentials({ id: userId }));
        if (!credentialsResult.ok) {
            return credentialsResult;
        }
        if (!credentialsResult.value || credentialsResult.value.length <= 0) {
            return { ok: false, error: new KeycloakClientError('Keycloak returned no credentials') };
        }

        const password: CredentialRepresentation | undefined = credentialsResult.value.find(
            (credential: CredentialRepresentation) => credential.type === 'password',
        );
        if (!password) {
            return { ok: false, error: new KeycloakClientError('Keycloak user has no password') };
        }
        if (!password.createdDate) {
            return { ok: false, error: new KeycloakClientError('Keycloak user password has no createdDate') };
        }

        const tolerance: number = 10000; // 10 seconds
        if (password.createdDate - userResult.value.createdTimestamp <= tolerance) {
            return { ok: false, error: new KeycloakClientError('Keycloak user password has never been updated') };
        }
        return { ok: true, value: new Date(password.createdDate) };
    }

    public async updateUsername(username: string, newUsername: string): Promise<Result<void, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();

        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }

        const keycloakUserResult: Result<UserRepresentation, DomainError> =
            await this.tryToFindKeycloakUserByUsernameForUpdate(kcAdminClientResult.value, username);

        if (!keycloakUserResult.ok) {
            return keycloakUserResult;
        }

        const updatedUserRepresentation: UserRepresentation = {
            username: newUsername,
        };

        try {
            await kcAdminClientResult.value.users.update(
                { id: keycloakUserResult.value.id! },
                updatedUserRepresentation,
            );
            this.logger.info(`Updated username for user:${keycloakUserResult.value.id}`);

            return { ok: true, value: undefined };
        } catch (err) {
            this.logger.logUnknownAsError('Could not update username', err);

            return { ok: false, error: new KeycloakClientError('Could not update username') };
        }
    }

    private async wrapClientResponse<T>(promise: Promise<T>): Promise<Result<T, DomainError>> {
        try {
            const result: T = await promise;
            return { ok: true, value: result };
        } catch (err) {
            this.logger.logUnknownAsError('Keycloak request failed', err);
            return { ok: false, error: new KeycloakClientError('Keycloak request failed', [err]) };
        }
    }

    private async mapResponseToDto(user?: UserRepresentation): Promise<Result<User<true>, DomainError>> {
        const userReprDto: UserRepresentationDto = plainToClass(UserRepresentationDto, user);
        const validationErrors: ValidationError[] = await validate(userReprDto);

        if (validationErrors.length > 0) {
            return { ok: false, error: new KeycloakClientError('Response is invalid') };
        }

        const userDo: User<true> = User.construct<true>(
            userReprDto.id,
            userReprDto.username,
            userReprDto.email,
            new Date(userReprDto.createdTimestamp),
            {}, // UserAttributes
            userReprDto.enabled,
        );

        return { ok: true, value: userDo };
    }

    public async updateKeycloakUserStatus(
        personId: string,
        keyCloakUserId: string,
        userLock: UserLock,
        lock: boolean,
    ): Promise<Result<void, DomainError>> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();
        if (!kcAdminClientResult.ok) {
            return kcAdminClientResult;
        }
        try {
            //lock describes whether the user should be locked or not
            if (lock) {
                const existingUserLock: UserLock | void = (await this.userLockRepository.findByPersonId(personId)).find(
                    (foundUserLock: UserLock) => foundUserLock.locked_occasion === PersonLockOccasion.MANUELL_GESPERRT,
                );
                if (existingUserLock) {
                    await this.userLockRepository.update(userLock);
                } else {
                    await this.userLockRepository.createUserLock(userLock);
                }
                const kcAdminClient: KeycloakAdminClient = kcAdminClientResult.value;
                await kcAdminClient.users.update({ id: keyCloakUserId }, { enabled: !lock });
            } else {
                await this.userLockRepository.deleteUserLock(personId, userLock.locked_occasion);
                const userLocks: UserLock[] = await this.userLockRepository.findByPersonId(personId);
                if (userLocks.length === 0) {
                    const kcAdminClient: KeycloakAdminClient = kcAdminClientResult.value;
                    await kcAdminClient.users.update({ id: keyCloakUserId }, { enabled: !lock });
                }
            }
            return { ok: true, value: undefined };
        } catch (err) {
            this.logger.logUnknownAsError('Could not update user status or database', err);
            return {
                ok: false,
                error: new KeycloakClientError('Could not update user status or database'),
            };
        }
    }

    public async getKeyCloakUserData(userId: string): Promise<UserRepresentation | undefined> {
        const kcAdminClientResult: Result<KeycloakAdminClient, DomainError> =
            await this.kcAdminService.getAuthedKcAdminClient();
        if (!kcAdminClientResult.ok) {
            return undefined;
        }
        try {
            const kcAdminClient: KeycloakAdminClient = kcAdminClientResult.value;
            const user: UserRepresentation | undefined = await kcAdminClient.users.findOne({ id: userId });
            return user;
        } catch (err) {
            this.logger.logUnknownAsError('Could not load keycloak userdata', err);
            return undefined;
        }
    }

    private async tryToFindKeycloakUserByUsernameForUpdate(
        kcAdminClient: KeycloakAdminClient,
        username: string,
    ): Promise<Result<UserRepresentation, DomainError>> {
        const filter: FindUserFilter = {
            username: username,
        };
        const userResult: Result<UserRepresentation[], DomainError> = await this.wrapClientResponse(
            kcAdminClient.users.find({ ...filter, exact: true }),
        );
        if (!userResult.ok) {
            return userResult;
        }

        if (!userResult.value[0]) {
            return {
                ok: false,
                error: new EntityNotFoundError(`Keycloak User could not be found`),
            };
        }

        const userRepresentation: UserRepresentation = userResult.value[0];
        if (!userRepresentation.id) {
            return {
                ok: false,
                error: new EntityNotFoundError(`Keycloak User has no id`),
            };
        }

        return {
            ok: true,
            value: userRepresentation,
        };
    }
}
