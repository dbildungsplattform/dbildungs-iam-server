import { type MockedObject, vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { MikroORM } from '@mikro-orm/core';
import { MeldungController } from './meldung.controller.js';
import { MeldungRepo } from '../persistence/meldung.repo.js';
import { MeldungModule } from '../meldung.module.js';
import { type Meldung } from '../domain/meldung.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { MeldungResponse } from './meldung.response.js';
import { MeldungStatus } from '../persistence/meldung.entity.js';
import { CreateOrUpdateMeldungBodyParams } from './create-or-update-meldung.body.params.js';
import { faker } from '@faker-js/faker';
import { MeldungInhaltError } from '../domain/meldung-inhalt.error.js';
import { MismatchedRevisionError } from '../../../shared/error/mismatched-revision.error.js';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { APP_FILTER } from '@nestjs/core';
import { SharedExceptionFilter } from '../../../shared/filter/shared-exception-filter.js';
import { ValidationExceptionFilter } from '../../../shared/filter/validation-exception-filter.js';
import { AuthenticationExceptionFilter } from '../../authentication/api/authentication-exception-filter.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';

describe('Meldung Controller', () => {
    let module: TestingModule;
    let meldungController: MeldungController;
    let meldungRepo: MockedObject<MeldungRepo>;
    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, MeldungModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true })],
            providers: [
                MeldungController,
                MeldungRepo,
                { provide: APP_FILTER, useClass: ValidationExceptionFilter },
                { provide: APP_FILTER, useClass: AuthenticationExceptionFilter },
                { provide: APP_FILTER, useClass: SharedExceptionFilter },
            ],
        })
            .overrideProvider(MeldungRepo)
            .useValue(createMock(MeldungRepo))
            .compile();

        await DatabaseTestModule.setupDatabase(module.get(MikroORM));

        meldungController = module.get(MeldungController);
        meldungRepo = module.get(MeldungRepo);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    afterAll(async () => {
        await module.get(MikroORM).close();
        await module.close();
    });

    it('should be defined', () => {
        expect(meldungController).toBeDefined();
        expect(meldungRepo).toBeDefined();
    });

    describe('get All Meldungen', () => {
        it('should return all meldungen if user has right permissions', async () => {
            const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
            const meldung: Meldung<true> = DoFactory.createMeldung(true);
            meldungRepo.findAll.mockResolvedValueOnce([meldung, meldung]);
            const response: MeldungResponse[] = await meldungController.getAllMeldungen(personpermissions);
            expect(response).toBeDefined();
            expect(response.length).toEqual(2);
        });

        it('should return all meldungen if user has right permissions', async () => {
            const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);
            const meldung: Meldung<true> = DoFactory.createMeldung(true);
            meldungRepo.findAll.mockResolvedValueOnce([meldung]);
            await expect(meldungController.getAllMeldungen(personpermissions)).rejects.toBeInstanceOf(
                MissingPermissionsError,
            );
        });
    });

    describe('get current Meldung', () => {
        it('should return current veroffentlicht meldung', async () => {
            const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
            const meldung: Meldung<true> = DoFactory.createMeldung(true);
            meldung.status = MeldungStatus.VEROEFFENTLICHT;
            meldungRepo.getRecentVeroeffentlichtMeldung.mockResolvedValueOnce(meldung);
            const response: MeldungResponse | null = await meldungController.getCurrentMeldung();
            expect(response).toBeInstanceOf(MeldungResponse);
        });

        it('should return nothing if no current veroeffentlicht meldung exists', async () => {
            const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
            meldungRepo.getRecentVeroeffentlichtMeldung.mockResolvedValueOnce(null);
            const response: MeldungResponse | null = await meldungController.getCurrentMeldung();
            expect(response).toBeNull();
        });
    });

    describe('createOrUpdateMeldung', () => {
        describe('create', () => {
            it('should create meldung of id is empty', async () => {
                const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                const body: CreateOrUpdateMeldungBodyParams = new CreateOrUpdateMeldungBodyParams();
                Object.assign(body, {
                    inhalt: faker.string.alphanumeric(100),
                    status: MeldungStatus.VEROEFFENTLICHT,
                    revision: 1,
                });

                const meldung: Meldung<true> = DoFactory.createMeldung(true);
                meldung.inhalt = body.inhalt;
                meldung.status = body.status;
                meldung.revision = body.revision;

                meldungRepo.save.mockResolvedValueOnce(meldung);

                const response: MeldungResponse = await meldungController.createOrUpdateMeldung(
                    body,
                    personpermissions,
                );
                expect(response).toBeInstanceOf(MeldungResponse);
                expect(response.inhalt).toEqual(body.inhalt);
                expect(response.revision).toEqual(body.revision);
                expect(response.status).toEqual(body.status);
                expect(meldungRepo.save).toHaveBeenCalledTimes(1);
            });

            it('should fail if invalid inhalt', async () => {
                const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                const body: CreateOrUpdateMeldungBodyParams = new CreateOrUpdateMeldungBodyParams();
                Object.assign(body, {
                    inhalt: faker.string.alphanumeric(2001),
                    status: MeldungStatus.VEROEFFENTLICHT,
                    revision: 1,
                });

                await expect(meldungController.createOrUpdateMeldung(body, personpermissions)).rejects.toThrow(
                    MeldungInhaltError,
                );
            });

            it('should fail if systemrechte are missing', async () => {
                const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);
                const body: CreateOrUpdateMeldungBodyParams = new CreateOrUpdateMeldungBodyParams();
                Object.assign(body, {
                    inhalt: faker.string.alphanumeric(100),
                    status: MeldungStatus.VEROEFFENTLICHT,
                    revision: 1,
                });

                await expect(meldungController.createOrUpdateMeldung(body, personpermissions)).rejects.toBeInstanceOf(
                    MissingPermissionsError,
                );
            });
        });
        describe('update', () => {
            it('should update meldung of id is provided', async () => {
                const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);
                const id: string = faker.string.uuid();
                const body: CreateOrUpdateMeldungBodyParams = new CreateOrUpdateMeldungBodyParams();
                Object.assign(body, {
                    id: id,
                    inhalt: faker.string.alphanumeric(100),
                    status: MeldungStatus.VEROEFFENTLICHT,
                    revision: 1,
                });

                const meldung: Meldung<true> = DoFactory.createMeldung(true);
                meldung.id = id;
                meldung.inhalt = faker.string.alphanumeric(100);
                meldung.status = body.status;
                meldung.revision = body.revision;

                meldungRepo.findById.mockResolvedValueOnce(meldung);
                meldungRepo.save.mockResolvedValueOnce(meldung);

                const response: MeldungResponse = await meldungController.createOrUpdateMeldung(
                    body,
                    personpermissions,
                );
                expect(response).toBeInstanceOf(MeldungResponse);
                expect(response.id).toEqual(id);
                expect(response.inhalt).toEqual(body.inhalt);
                expect(response.revision).toEqual(body.revision + 1);
                expect(response.status).toEqual(body.status);
                expect(meldungRepo.save).toHaveBeenCalledTimes(1);
            });

            it('should fail if invalid inhalt', async () => {
                const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);

                const id: string = faker.string.uuid();
                const body: CreateOrUpdateMeldungBodyParams = new CreateOrUpdateMeldungBodyParams();
                Object.assign(body, {
                    id: id,
                    inhalt: faker.string.alphanumeric(2001),
                    status: MeldungStatus.VEROEFFENTLICHT,
                    revision: 1,
                });

                const meldung: Meldung<true> = DoFactory.createMeldung(true);
                meldung.id = id;
                meldung.inhalt = faker.string.alphanumeric(100);
                meldung.status = body.status;
                meldung.revision = body.revision;

                meldungRepo.findById.mockResolvedValueOnce(meldung);

                await expect(meldungController.createOrUpdateMeldung(body, personpermissions)).rejects.toThrow(
                    MeldungInhaltError,
                );
            });

            it('should fail if mismatched revision', async () => {
                const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);

                const id: string = faker.string.uuid();
                const body: CreateOrUpdateMeldungBodyParams = new CreateOrUpdateMeldungBodyParams();
                Object.assign(body, {
                    id: id,
                    inhalt: faker.string.alphanumeric(100),
                    status: MeldungStatus.VEROEFFENTLICHT,
                    revision: 10,
                });

                const meldung: Meldung<true> = DoFactory.createMeldung(true);
                meldung.id = id;
                meldung.inhalt = faker.string.alphanumeric(100);
                meldung.status = body.status;
                meldung.revision = 1;

                meldungRepo.findById.mockResolvedValueOnce(meldung);

                await expect(meldungController.createOrUpdateMeldung(body, personpermissions)).rejects.toThrow(
                    MismatchedRevisionError,
                );
            });

            it('should fail if existing merkmal not found', async () => {
                const personpermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissions.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);

                const id: string = faker.string.uuid();
                const body: CreateOrUpdateMeldungBodyParams = new CreateOrUpdateMeldungBodyParams();
                Object.assign(body, {
                    id: id,
                    inhalt: faker.string.alphanumeric(100),
                    status: MeldungStatus.VEROEFFENTLICHT,
                    revision: 1,
                });

                meldungRepo.findById.mockResolvedValueOnce(undefined);

                await expect(meldungController.createOrUpdateMeldung(body, personpermissions)).rejects.toBeInstanceOf(
                    EntityNotFoundError,
                );
            });
        });
    });
});
