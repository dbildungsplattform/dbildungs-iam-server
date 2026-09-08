import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
} from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import {
    DomainError,
    EntityNotFoundError,
    InvalidAttributeLengthError,
    InvalidCharacterSetError,
    InvalidNameError,
    KeycloakClientError,
} from '../../../shared/error/index.js';
import { FindUserFilter, KeycloakUserService } from '../../keycloak-administration/index.js';
import { OxUserBlacklistEntity } from '../persistence/ox-user-blacklist.entity.js';
import { OxUserBlacklistRepo } from '../persistence/ox-user-blacklist.repo.js';
import { UsernameGeneratorService } from './username-generator.service.js';

describe('UsernameGeneratorService', () => {
    let module: TestingModule;
    let service: UsernameGeneratorService;
    let kcUserService: DeepMocked<KeycloakUserService>;
    let loggerMock: DeepMocked<ClassLogger>;
    let em: EntityManager;
    let orm: MikroORM;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true })],
            providers: [
                UsernameGeneratorService,
                OxUserBlacklistRepo,
                {
                    provide: KeycloakUserService,
                    useValue: createMock(KeycloakUserService),
                },
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
            ],
        }).compile();
        orm = module.get(MikroORM);
        service = module.get(UsernameGeneratorService);
        kcUserService = module.get(KeycloakUserService);
        loggerMock = module.get(ClassLogger);
        em = module.get(EntityManager);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    afterAll(async () => {
        await module.close();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should give an all lowercase username', async () => {
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('Torsten', 'Rottelburg')).resolves.toStrictEqual({
            ok: true,
            value: 'trottelburg',
        });
    });

    it('should give an Error when the fist name is empty', async () => {
        await expect(service.generateUsername('', 'Rottelburg')).resolves.toStrictEqual({
            ok: false,
            error: new InvalidAttributeLengthError('name.vorname'),
        });
    });

    it('should give an Error when the last name is empty', async () => {
        await expect(service.generateUsername('Torsten', '')).resolves.toEqual({
            ok: false,
            error: new InvalidAttributeLengthError('name.familienname'),
        });
    });

    it('should normalize german, danish and french special characters', async () => {
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('Åron', 'åàâçèéêëîïôùûÿäæöøœüß')).resolves.toStrictEqual({
            ok: true,
            value: 'aaaaaceeeeiiouuyaeaeoeoeoeuess',
        });
    });

    it('should remove diacritics', async () => {
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('Èlène', 'Lunâtiz')).resolves.toStrictEqual({
            ok: true,
            value: 'elunatiz',
        });
    });

    it('should not accept invalid character set in firstname', async () => {
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('Èlène?', 'L.,unâtiz')).resolves.toStrictEqual({
            ok: false,
            error: new InvalidCharacterSetError('name.vorname', 'DIN-91379A'),
        });
    });

    it('should not accept invalid character set in lastname', async () => {
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('Èlène', 'L.,unâtiz?')).resolves.toStrictEqual({
            ok: false,
            error: new InvalidCharacterSetError('name.familienname', 'DIN-91379A'),
        });
    });

    it('should remove non-letters N1 (bnlreq) chars', async () => {
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('Ebru', 'Alt‡nova')).resolves.toStrictEqual({
            ok: true,
            value: 'ealtnova',
        });
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('‡re', 'Olsen')).resolves.toStrictEqual({
            ok: true,
            value: 'rolsen',
        });
    });

    it('should add a number when username already exists', async () => {
        kcUserService.findOne
            .mockResolvedValueOnce({ ok: true, value: DoFactory.createUser(true) })
            .mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('Not found') });
        const generatedUsername: Result<string, DomainError> = await service.generateUsername('Max', 'Meyer');
        expect(loggerMock.info).toHaveBeenLastCalledWith(`Next Available Username Is:mmeyer1`);
        expect(generatedUsername).toEqual({ ok: true, value: 'mmeyer1' });
    });

    it('should increment the counter when a username would exist more than twice', async () => {
        kcUserService.findOne.mockImplementation((userFilter: FindUserFilter) => {
            if (userFilter.username === 'mmeyer' || userFilter.username === 'mmeyer1') {
                return Promise.resolve({ ok: true, value: DoFactory.createUser(true) });
            } else {
                return Promise.resolve({ ok: false, error: new EntityNotFoundError('Not found') });
            }
        });
        const generatedUsername: Result<string, DomainError> = await service.generateUsername('Max', 'Meyer');
        expect(loggerMock.info).toHaveBeenLastCalledWith(`Next Available Username Is:mmeyer2`);
        expect(generatedUsername).toEqual({ ok: true, value: 'mmeyer2' });
    });

    it("Should fill 'holes' in the counter if there are any", async () => {
        kcUserService.findOne
            .mockResolvedValueOnce({ ok: true, value: DoFactory.createUser(true) })
            .mockResolvedValueOnce({ ok: true, value: DoFactory.createUser(true) })
            .mockResolvedValueOnce({ ok: true, value: DoFactory.createUser(true) })
            .mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('Not found') })
            .mockResolvedValueOnce({ ok: true, value: DoFactory.createUser(true) });
        const generatedUsername: Result<string, DomainError> = await service.generateUsername('Renate', 'Bergmann');
        expect(loggerMock.info).toHaveBeenLastCalledWith(`Next Available Username Is:rbergmann3`);
        expect(generatedUsername).toEqual({ ok: true, value: 'rbergmann3' });
    });

    it("Should pass along an error thrown if it's not Entity not found", async () => {
        kcUserService.findOne.mockResolvedValue({ ok: false, error: new KeycloakClientError('Could not reach') });
        await expect(service.generateUsername('Maximilian', 'Mustermann')).rejects.toStrictEqual(
            new KeycloakClientError('Could not reach'),
        );
        expect(loggerMock.info).toHaveBeenCalledTimes(0);
    });

    it('should return error if username can not be generated (cleaned names are of length 0)', async () => {
        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('‡‡', 'Mustermann')).resolves.toStrictEqual({
            ok: false,
            error: new InvalidNameError('Could not generate valid username'),
        });

        kcUserService.findOne.mockResolvedValueOnce({ ok: false, error: new EntityNotFoundError('None there') });
        await expect(service.generateUsername('Alex', '‡‡')).resolves.toStrictEqual({
            ok: false,
            error: new InvalidNameError('Could not generate valid username'),
        });
    });

    it('should add a number when username exists in blacklist', async () => {
        // Arrange: Create the OxUserBlacklistEntity with the username
        const usernameInBlacklist: string = 'mmeyer';
        const oxUser: OxUserBlacklistEntity = new OxUserBlacklistEntity();
        oxUser.username = usernameInBlacklist;
        oxUser.email = 'email';
        oxUser.name = 'meyer';

        // Persist the OxUserBlacklistEntity to the real database
        await em.persist(oxUser).flush();

        // Arrange Keycloak response (simulate the user not found in Keycloak)
        kcUserService.findOne.mockResolvedValueOnce({
            ok: false,
            error: new EntityNotFoundError('Not found'),
        });

        // Arrange Keycloak response (simulate the user not found in Keycloak)
        kcUserService.findOne.mockResolvedValueOnce({
            ok: false,
            error: new EntityNotFoundError('Not found'),
        });

        // Act: Generate the username
        const generatedUsername: Result<string, DomainError> = await service.generateUsername('Max', 'Meyer');

        // Assert: The generated username should have the counter appended
        expect(loggerMock.info).toHaveBeenLastCalledWith(`Next Available Username Is:mmeyer1`);

        expect(generatedUsername).toEqual({ ok: true, value: 'mmeyer1' });
    });
});
