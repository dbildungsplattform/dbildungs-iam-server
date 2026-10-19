import { faker } from '@faker-js/faker';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { EntityCouldNotBeCreated } from '../../shared/error/entity-could-not-be-created.error.js';
import { EntityCouldNotBeUpdated } from '../../shared/error/entity-could-not-be-updated.error.js';
import { type PersonPermissions } from '../authentication/domain/person-permissions.js';
import { Person } from '../person/domain/person.js';
import { PersonRepository } from '../person/persistence/person.repository.js';
import { AssignHardwareTokenBodyParams } from './api/assign-hardware-token.body.params.js';
import { AssignHardwareTokenResponse } from './api/assign-hardware-token.response.js';
import { TokenError } from './api/error/token.error.js';
import { TokenRequiredResponse } from './api/token-required.response.js';
import { PrivacyIdeaAdministrationController } from './privacy-idea-administration.controller.js';
import { PrivacyIdeaAdministrationService } from './privacy-idea-administration.service.js';
import { type AssignTokenResponse, type PrivacyIdeaToken, type ResetTokenResponse } from './privacy-idea-api.types.js';
import { TokenStateResponse } from './token-state.response.js';
import { SoftwareTokenInitializationError } from './api/error/software-token-initialization.error.js';
import { LoggingTestModule } from '../../../test/utils/logging-test.module.js';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { createPersonPermissionsMock } from '../../../test/utils/auth.mock.js';
import { TokenVerifyBodyParams } from './token-verify.params.js';
import { TokenInitBodyParams } from './token-init.body.params.js';

describe('PrivacyIdeaAdministrationController', () => {
    let module: TestingModule;
    let sut: PrivacyIdeaAdministrationController;
    let serviceMock: DeepMocked<PrivacyIdeaAdministrationService>;
    let personRepository: DeepMocked<PersonRepository>;
    let personPermissionsMock: DeepMocked<PersonPermissions>;

    function getPerson(emptyUsername: boolean = false): Person<true> {
        return Person.construct(
            faker.string.uuid(),
            faker.date.past(),
            faker.date.recent(),
            faker.person.lastName(),
            faker.person.firstName(),
            '1',
            emptyUsername ? undefined : faker.string.uuid(),
            faker.lorem.word(),
            faker.lorem.word(),
        );
    }

    beforeEach(async () => {
        module = await Test.createTestingModule({
            controllers: [PrivacyIdeaAdministrationController],
            imports: [LoggingTestModule],
            providers: [
                {
                    provide: PrivacyIdeaAdministrationService,
                    useValue: createMock(PrivacyIdeaAdministrationService),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
            ],
        }).compile();

        sut = module.get<PrivacyIdeaAdministrationController>(PrivacyIdeaAdministrationController);
        serviceMock = module.get<DeepMocked<PrivacyIdeaAdministrationService>>(PrivacyIdeaAdministrationService);
        personRepository = module.get<DeepMocked<PersonRepository>>(PersonRepository);
        personPermissionsMock = createPersonPermissionsMock();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
        expect(serviceMock).toBeDefined();
    });

    describe('PrivacyIdeaAdministrationController initializeSoftwareToken', () => {
        it('should successfully create a token', async () => {
            const person: Person<true> = getPerson();

            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            serviceMock.initializeSoftwareToken.mockResolvedValue('token123');
            const tokenInitBodyParams: TokenInitBodyParams = new TokenInitBodyParams();
            Object.assign(tokenInitBodyParams, { username: 'user1' });

            const response: string = await sut.initializeSoftwareToken(tokenInitBodyParams, personPermissionsMock);
            expect(response).toEqual('token123');
        });

        it('should return forbidden insufficient permissions', async () => {
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: false,
                error: new Error('Forbidden access'),
            });
            const tokenInitBodyParams: TokenInitBodyParams = new TokenInitBodyParams();
            Object.assign(tokenInitBodyParams, { username: 'user1' });

            await expect(sut.initializeSoftwareToken(tokenInitBodyParams, personPermissionsMock)).rejects.toThrow(
                new HttpException(new Error('Forbidden access'), HttpStatus.FORBIDDEN),
            );
        });
        it('should return forbidden insufficient permissions', async () => {
            const person: Person<true> = getPerson();
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });
            serviceMock.initializeSoftwareToken.mockRejectedValueOnce(
                new SoftwareTokenInitializationError('SoftwareToken Error'),
            );
            const tokenInitBodyParams: TokenInitBodyParams = new TokenInitBodyParams();
            Object.assign(tokenInitBodyParams, { username: 'user1' });

            await expect(sut.initializeSoftwareToken(tokenInitBodyParams, personPermissionsMock)).rejects.toThrow(
                new SoftwareTokenInitializationError('SoftwareToken Error'),
            );
        });
    });

    describe('PrivacyIdeaAdministrationController getTwoAuthState', () => {
        it('should successfully retrieve token state', async () => {
            const person: Person<true> = getPerson();
            const twoFaRequired: boolean = true;

            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });
            serviceMock.requires2fa.mockResolvedValueOnce(twoFaRequired);

            const mockTokenState: PrivacyIdeaToken = {
                serial: 'serial123',
                info: {
                    tokenkind: 'software',
                    timeWindow: '30',
                    hashlib: 'sha1',
                    timeStep: '30',
                    timeShift: '0',
                },
                active: false,
                count: 0,
                count_window: 0,
                description: '',
                failcount: 0,
                id: 0,
                locked: false,
                maxfail: 0,
                otplen: 0,
                realms: [],
                resolver: '',
                revoked: false,
                rollout_state: '',
                sync_window: 0,
                tokengroup: [],
                tokentype: '',
                user_editable: false,
                user_id: '',
                user_realm: '',
                username: '',
            };

            serviceMock.getTwoAuthState.mockResolvedValue(mockTokenState);
            const response: TokenStateResponse = await sut.getTwoAuthState('user1', personPermissionsMock);
            expect(response).toEqual(new TokenStateResponse(mockTokenState));
        });

        it('should successfully retrieve empty token state when user is undefined', async () => {
            const person: Person<true> = getPerson();
            const twoFaRequired: boolean = true;

            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            serviceMock.getTwoAuthState.mockResolvedValue(undefined);
            serviceMock.requires2fa.mockResolvedValue(twoFaRequired);
            const response: TokenStateResponse = await sut.getTwoAuthState('user1', personPermissionsMock);
            expect(response).toEqual(new TokenStateResponse(undefined));
        });

        it('should return forbidden insufficient permissions', async () => {
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: false,
                error: new Error('Forbidden access'),
            });

            await expect(sut.getTwoAuthState('user1', personPermissionsMock)).rejects.toThrow(
                new HttpException(new Error('Forbidden access'), HttpStatus.FORBIDDEN),
            );
        });

        it('should return user not found if username is undefined', async () => {
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: getPerson(true),
            });

            await expect(sut.getTwoAuthState('user1', personPermissionsMock)).rejects.toThrow(
                new HttpException('User not found.', HttpStatus.BAD_REQUEST),
            );
        });

        it('should return user not found if username is undefined', async () => {
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: getPerson(true),
            });

            await expect(sut.getTwoAuthState('user1', personPermissionsMock)).rejects.toThrow(
                new HttpException('User not found.', HttpStatus.BAD_REQUEST),
            );
        });

        it('should return user not found if username is undefined self service', async () => {
            personRepository.findById.mockResolvedValueOnce(getPerson(true));
            personPermissionsMock.personFields.id = 'user1';

            await expect(sut.getTwoAuthState('user1', personPermissionsMock)).rejects.toThrow(
                new HttpException('User not found.', HttpStatus.BAD_REQUEST),
            );
        });

        it('should return valid response if username is valid self service', async () => {
            personRepository.findById.mockResolvedValueOnce(getPerson(false));
            personPermissionsMock.personFields.id = 'user1';

            serviceMock.getTwoAuthState.mockResolvedValue(undefined);
            const response: TokenStateResponse = await sut.getTwoAuthState('user1', personPermissionsMock);
            expect(response).toEqual(new TokenStateResponse(undefined));
        });
    });

    describe('PrivacyIdeaAdministrationController resetToken', () => {
        it('should successfully reset a token', async () => {
            const person: Person<true> = getPerson();
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });
            const personId: string = 'user1';
            const mockResetTokenResponse: ResetTokenResponse = {
                result: { status: true },
            } as ResetTokenResponse;

            serviceMock.resetToken.mockResolvedValue(mockResetTokenResponse);

            const response: boolean = await sut.resetToken(personId, personPermissionsMock);

            expect(response).toEqual(mockResetTokenResponse.result.status);
            expect(serviceMock.resetToken).toHaveBeenCalledWith(person.username);
        });

        it('should return bad request if username is not given or not found', async () => {
            const personId: string = 'user1';
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: false,
                error: new Error('Forbidden access'),
            });

            await expect(sut.resetToken(personId, personPermissionsMock)).rejects.toThrow(
                new HttpException(new Error('Forbidden access'), HttpStatus.FORBIDDEN),
            );
        });

        it('should return unauthorized if not authorized to reset token', async () => {
            const personId: string = 'user1';
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: getPerson(true),
            });

            await expect(sut.resetToken(personId, personPermissionsMock)).rejects.toThrow(
                new HttpException('User not found.', HttpStatus.BAD_REQUEST),
            );
        });

        it('should throw TokenError if caught during resetToken', async () => {
            const person: Person<true> = getPerson();
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            const personId: string = 'user1';
            const tokenError: TokenError = new TokenError('Something went wrong', 'Error');
            serviceMock.resetToken.mockRejectedValue(tokenError);

            await expect(sut.resetToken(personId, personPermissionsMock)).rejects.toThrow(tokenError);

            expect(serviceMock.resetToken).toHaveBeenCalledWith(person.username);
        });

        it('should map other errors to SchulConnexError', async () => {
            const person: Person<true> = getPerson();
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            const personId: string = 'user1';
            const entityCouldNotBeUpdatedError: EntityCouldNotBeUpdated = createMock(EntityCouldNotBeUpdated);
            serviceMock.resetToken.mockRejectedValue(entityCouldNotBeUpdatedError);

            await expect(sut.resetToken(personId, personPermissionsMock)).rejects.toBeInstanceOf(
                EntityCouldNotBeUpdated,
            );

            expect(serviceMock.resetToken).toHaveBeenCalledWith(person.username);
        });
    });

    describe('PrivacyIdeaAdministrationController assignHardwareToken', () => {
        it('should successfully assign a hardware token', async () => {
            const mockParams: AssignHardwareTokenBodyParams = new AssignHardwareTokenBodyParams();
            const mockAssignTokenResponse: AssignTokenResponse = {
                id: 1,
                jsonrpc: '2.0',
                time: Date.now(),
                version: '1.0',
                versionnumber: '1',
                signature: faker.string.uuid(),
                result: { status: true, value: true },
            };
            const person: Person<true> = getPerson();

            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            serviceMock.assignHardwareToken.mockResolvedValueOnce(mockAssignTokenResponse);
            const response: AssignHardwareTokenResponse | undefined = await sut.assignHardwareToken(
                mockParams,
                personPermissionsMock,
            );

            expect(response).toEqual(
                new AssignHardwareTokenResponse(
                    mockAssignTokenResponse.id,
                    mockAssignTokenResponse.jsonrpc,
                    mockAssignTokenResponse.time,
                    mockAssignTokenResponse.version,
                    mockAssignTokenResponse.versionnumber,
                    mockAssignTokenResponse.signature,
                    'Token wurde erfolgreich zugeordnet.',
                ),
            );
        });

        it('should return forbidden if permissions are insufficient', async () => {
            const mockParams: AssignHardwareTokenBodyParams = new AssignHardwareTokenBodyParams();

            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: false,
                error: new Error('Forbidden access'),
            });

            await expect(sut.assignHardwareToken(mockParams, personPermissionsMock)).rejects.toThrow(
                new HttpException(new Error('Forbidden access'), HttpStatus.FORBIDDEN),
            );
        });

        it('should return user not found if username is undefined', async () => {
            const mockParams: AssignHardwareTokenBodyParams = new AssignHardwareTokenBodyParams();

            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: getPerson(true),
            });

            await expect(sut.assignHardwareToken(mockParams, personPermissionsMock)).rejects.toThrow(
                new HttpException('User not found.', HttpStatus.BAD_REQUEST),
            );
        });

        it('should throw TokenError if service throws it', async () => {
            const mockParams: AssignHardwareTokenBodyParams = new AssignHardwareTokenBodyParams();
            const tokenError: TokenError = new TokenError('Something went wrong', 'Error');
            const person: Person<true> = getPerson();
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            serviceMock.assignHardwareToken.mockRejectedValueOnce(tokenError);

            await expect(sut.assignHardwareToken(mockParams, personPermissionsMock)).rejects.toThrow(tokenError);
        });

        it('should return mapped internal server error for unexpected error', async () => {
            const mockParams: AssignHardwareTokenBodyParams = new AssignHardwareTokenBodyParams();
            const unexpectedError: Error = new Error('Unexpected error');
            const person: Person<true> = getPerson();
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            serviceMock.assignHardwareToken.mockRejectedValue(unexpectedError);

            await expect(sut.assignHardwareToken(mockParams, personPermissionsMock)).rejects.toBeInstanceOf(
                EntityCouldNotBeCreated,
            );
        });
    });

    describe('PrivacyIdeaAdministrationController verify', () => {
        it('should successfully verify token', async () => {
            personPermissionsMock = createPersonPermissionsMock();
            const person: Person<true> = getPerson();

            vi.spyOn(personRepository, 'getPersonIfAllowed').mockResolvedValueOnce({
                ok: true,
                value: person,
            });

            const tokenVerifyBodyParams: TokenVerifyBodyParams = new TokenVerifyBodyParams();
            Object.assign(tokenVerifyBodyParams, { personId: 'user1', otp: '123456' });
            await expect(sut.verifyToken(tokenVerifyBodyParams, personPermissionsMock)).resolves.not.toThrow();
        });
        it('should throw an error when trying to verify', async () => {
            personPermissionsMock = createPersonPermissionsMock();
            const person: Person<true> = getPerson();

            personRepository.getPersonIfAllowed.mockResolvedValueOnce({
                ok: true,
                value: person,
            });
            const error: Error = new Error('verification failed');
            serviceMock.verifyTokenEnrollment.mockRejectedValueOnce(error);

            await expect(sut.verifyToken({ personId: 'user1', otp: '123456' }, personPermissionsMock)).rejects.toThrow(
                error,
            );
        });

        it('should return forbidden insufficient permissions', async () => {
            personPermissionsMock = createPersonPermissionsMock();

            vi.spyOn(personRepository, 'getPersonIfAllowed').mockResolvedValueOnce({
                ok: false,
                error: new Error('Forbidden access'),
            });

            await expect(sut.verifyToken({ personId: 'user1', otp: '123456' }, personPermissionsMock)).rejects.toThrow(
                new HttpException(new Error('Forbidden access'), HttpStatus.FORBIDDEN),
            );
        });

        it('should return user not found if username is undefined', async () => {
            personPermissionsMock = createPersonPermissionsMock();

            vi.spyOn(personRepository, 'getPersonIfAllowed').mockResolvedValueOnce({
                ok: true,
                value: getPerson(true),
            });

            await expect(sut.verifyToken({ personId: 'user1', otp: '123456' }, personPermissionsMock)).rejects.toThrow(
                new HttpException('User not found.', HttpStatus.BAD_REQUEST),
            );
        });
    });

    describe('requires2fa', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
            personRepository.getPersonIfAllowed.mockResolvedValueOnce({ ok: true, value: getPerson() });
        });

        it.each([[true], [false]])('should return %s', async (expected: boolean) => {
            serviceMock.requires2fa.mockResolvedValueOnce(expected);
            const expectedResponse: TokenRequiredResponse = new TokenRequiredResponse(expected);

            const actual: TokenRequiredResponse = await sut.requiresTwoFactorAuthentication('', personPermissionsMock);

            expect(actual).toStrictEqual(expectedResponse);
        });
    });
});
