import { faker } from '@faker-js/faker';
import { APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { ImportController } from './import.controller.js';
import { ImportWorkflowFactory } from '../domain/import-workflow.factory.js';
import { ImportWorkflow } from '../domain/import-workflow.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { type Response } from 'express';
import { ImportTextFileCreationError } from '../domain/import-text-file-creation.error.js';
import { type ImportvorgangByIdBodyParams } from './importvorgang-by-id.body.params.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { type ImportvorgangByIdParams } from './importvorgang-by-id.params.js';
import { ImportVorgangRepository } from '../persistence/import-vorgang.repository.js';
import { ImportDataRepository } from '../persistence/import-data.repository.js';
import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { type ImportPasswordEncryptor } from '../domain/import-password-encryptor.js';
import { type EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { type ClassLogger } from '../../../core/logging/class-logger.js';
import { ConfigService } from '@nestjs/config';

describe('Import API with mocked ImportWorkflow', () => {
    let sut: ImportController;
    let importWorkflowFactoryMock: DeepMocked<ImportWorkflowFactory>;
    let ImportWorkflowMock: DeepMocked<ImportWorkflow>;

    beforeAll(async () => {
        const configService: DeepMocked<ConfigService> = createMock(ConfigService);
        configService.getOrThrow.mockReturnValue({ CSV_MAX_NUMBER_OF_USERS: 1000 });
        const importWorkflowInstance: ImportWorkflow = ImportWorkflow.createNew(
            null as unknown as RolleRepo,
            null as unknown as OrganisationRepository,
            null as unknown as ImportDataRepository,
            null as unknown as ImportVorgangRepository,
            null as unknown as ImportPasswordEncryptor,
            null as unknown as EventRoutingLegacyKafkaService,
            null as unknown as ClassLogger,
            configService,
        );

        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                // {
                //     provide: ConfigService,
                //     useValue: configService,
                // },
                {
                    provide: ImportWorkflowFactory,
                    useValue: createMock<ImportWorkflowFactory>(ImportWorkflowFactory),
                },
                {
                    provide: ImportWorkflow,
                    useValue: vi.mockObject<ImportWorkflow>(importWorkflowInstance),
                },
                {
                    provide: ImportVorgangRepository,
                    useValue: createMock<ImportVorgangRepository>(ImportVorgangRepository),
                },
                {
                    provide: ImportDataRepository,
                    useValue: createMock<ImportDataRepository>(ImportDataRepository),
                },
                ImportController,
            ],
        }).compile();

        sut = module.get(ImportController);
        ImportWorkflowMock = module.get(ImportWorkflow);
        importWorkflowFactoryMock = module.get(ImportWorkflowFactory);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('/POST download the import result', () => {
        describe('if the import result file cannot be created', () => {
            it('should throw an ImportTextFileCreationError', async () => {
                const params: ImportvorgangByIdBodyParams = {
                    importvorgangId: faker.string.uuid(),
                };
                const responseMock: Response = {} as unknown as Response;

                const personpermissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(true);

                ImportWorkflowMock.downloadFile.mockResolvedValueOnce({
                    ok: false,
                    error: new ImportTextFileCreationError(['Reason']),
                });
                importWorkflowFactoryMock.createNew.mockReturnValueOnce(ImportWorkflowMock);

                await expect(sut.downloadFile(params, responseMock, personpermissionsMock)).rejects.toThrow(
                    new ImportTextFileCreationError(['Reason']),
                );
            });
        });
    });

    describe('/DELETE cancel the import transaction', () => {
        describe('if the admin does not rights to import', () => {
            it('should throw an HttpExcetion', async () => {
                const params: ImportvorgangByIdParams = {
                    importvorgangId: faker.string.uuid(),
                };

                const personpermissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personpermissionsMock.hasSystemrechteAtRootOrganisation.mockResolvedValueOnce(false);

                ImportWorkflowMock.cancelOrCompleteImport.mockResolvedValueOnce({
                    ok: false,
                    error: new MissingPermissionsError('Unauthorized to import data'),
                });
                importWorkflowFactoryMock.createNew.mockReturnValueOnce(ImportWorkflowMock);

                await expect(sut.deleteImportTransaction(params, personpermissionsMock)).rejects.toBeInstanceOf(
                    MissingPermissionsError,
                );
            });
        });
    });
});
