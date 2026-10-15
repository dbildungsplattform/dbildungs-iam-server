import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ImportDataRepository } from '../persistence/import-data.repository.js';
import {
    PersonenkontextCreationService,
    type PersonPersonenkontext,
} from '../../personenkontext/domain/personenkontext-creation.service.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { Person } from '../../person/domain/person.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { type ImportDataItem } from './import-data-item.js';
import { ImportVorgangRepository } from '../persistence/import-vorgang.repository.js';
import { type ImportVorgang } from './import-vorgang.js';
import { ImportEventHandler } from './import-event-handler.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ImportExecutedEvent } from '../../../shared/events/import-executed.event.js';
import { RolleNurAnPassendeOrganisationError } from '../../personenkontext/specification/error/rolle-nur-an-passende-organisation.js';
import { ImportPasswordEncryptor } from './import-password-encryptor.js';
import { ImportDataItemStatus } from './importDataItem.enum.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { ImportStatus } from './import.enums.js';

describe('ImportEventHandler', () => {
    let module: TestingModule;
    let sut: ImportEventHandler;

    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let permissionsRepoMock: DeepMocked<PersonPermissionsRepo>;
    let importDataRepositoryMock: DeepMocked<ImportDataRepository>;
    let personenkontextCreationServiceMock: DeepMocked<PersonenkontextCreationService>;
    let importVorgangRepositoryMock: DeepMocked<ImportVorgangRepository>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot()],
            providers: [
                ImportEventHandler,
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: ImportDataRepository,
                    useValue: createMock(ImportDataRepository),
                },
                {
                    provide: PersonenkontextCreationService,
                    useValue: createMock(PersonenkontextCreationService),
                },
                {
                    provide: ImportVorgangRepository,
                    useValue: createMock(ImportVorgangRepository),
                },
                {
                    provide: ImportPasswordEncryptor,
                    useValue: createMock(ImportPasswordEncryptor),
                },
                {
                    provide: PersonPermissionsRepo,
                    useValue: createMock(PersonPermissionsRepo),
                },
            ],
        }).compile();

        sut = module.get(ImportEventHandler);
        organisationRepoMock = module.get(OrganisationRepository);
        permissionsRepoMock = module.get(PersonPermissionsRepo);
        importDataRepositoryMock = module.get(ImportDataRepository);
        personenkontextCreationServiceMock = module.get(PersonenkontextCreationService);
        importVorgangRepositoryMock = module.get(ImportVorgangRepository);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        permissionsRepoMock.loadPersonPermissions.mockResolvedValueOnce(createPersonPermissionsMock());
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('handleExecuteImport', () => {
        const importvorgangId: string = faker.string.uuid();
        let event: ImportExecutedEvent;

        beforeEach(() => {
            event = new ImportExecutedEvent(
                importvorgangId,
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.uuid(),
            );
        });

        it('should return EntityNotFoundError if a ImportVorgang does not exist', async () => {
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, name: '1A' }),
            ]);
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(null);
            const error: DomainError = new EntityNotFoundError('ImportVorgang', importvorgangId);

            await expect(sut.handleExecuteImport(event, () => undefined)).rejects.toThrowError(error);

            expect(personenkontextCreationServiceMock.createPersonWithPersonenkontexte).not.toHaveBeenCalled();
        });

        it('should log error if the import has status other than valid', async () => {
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE }),
            ]);
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(
                DoFactory.createImportVorgang(true, { id: importvorgangId, status: ImportStatus.STARTED }),
            );

            await sut.handleExecuteImport(event, () => undefined);

            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Could not start ImportVorgang, because it did not have a valid state`,
                { id: importvorgangId, status: ImportStatus.STARTED },
            );
            expect(personenkontextCreationServiceMock.createPersonWithPersonenkontexte).not.toHaveBeenCalled();
        });

        it('should log error if the import transaction does not have any import data items', async () => {
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE }),
            ]);
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(
                DoFactory.createImportVorgang(true, { id: importvorgangId, status: ImportStatus.VALID }),
            );
            importDataRepositoryMock.findByImportVorgangId.mockResolvedValueOnce([[], 0]);

            await sut.handleExecuteImport(event, () => undefined);

            expect(loggerMock.error).toHaveBeenCalledWith(
                `No import data items found for Importvorgang:${importvorgangId}`,
            );
            expect(personenkontextCreationServiceMock.createPersonWithPersonenkontexte).not.toHaveBeenCalled();
        });

        it('should mark the data item as FAILED if a klasse during the import execution was deleted', async () => {
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, name: '1A' }),
            ]);
            const importvorgang: ImportVorgang<true> = DoFactory.createImportVorgang(true, {
                status: ImportStatus.VALID,
            });
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(importvorgang);
            const importDataItem: ImportDataItem<true> = DoFactory.createImportDataItem(true, {
                importvorgangId: importvorgang.id,
                klasse: '1B',
            });
            importDataRepositoryMock.findByImportVorgangId.mockResolvedValueOnce([[importDataItem], 1]);
            importVorgangRepositoryMock.save.mockResolvedValueOnce(importvorgang);

            await sut.handleExecuteImport(event, () => undefined);

            expect(importDataItem.status).toEqual(ImportDataItemStatus.FAILED); // Verify the status was updated if the item failed
            expect(importDataRepositoryMock.save).toHaveBeenCalledWith(importDataItem);
            expect(personenkontextCreationServiceMock.createPersonWithPersonenkontexte).not.toHaveBeenCalled();
            expect(importVorgangRepositoryMock.save).toHaveBeenCalled();
        });

        it('should log error if the person and PKs were not saved successfully', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '1A',
            });
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([klasse]);

            const importvorgang: ImportVorgang<true> = DoFactory.createImportVorgang(true, {
                status: ImportStatus.VALID,
            });
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(importvorgang);
            const importDataItem: ImportDataItem<true> = DoFactory.createImportDataItem(true, {
                importvorgangId: importvorgang.id,
                klasse: '1A',
            });

            importDataRepositoryMock.findByImportVorgangId.mockResolvedValueOnce([[importDataItem], 1]);
            importVorgangRepositoryMock.save.mockResolvedValueOnce(importvorgang);

            const error: DomainError = new RolleNurAnPassendeOrganisationError();
            personenkontextCreationServiceMock.createPersonWithPersonenkontexte.mockResolvedValueOnce({
                ok: false,
                error: error,
            });
            organisationRepoMock.findById.mockResolvedValueOnce(schule);

            await sut.handleExecuteImport(event, () => undefined);

            expect(loggerMock.error).toHaveBeenCalledWith(
                `Failed to create user for ${importDataItem.vorname} ${importDataItem.nachname}. Error: ${error.message}`,
            );
            expect(importDataRepositoryMock.save).toHaveBeenCalled();
            expect(importDataItem.status).toEqual(ImportDataItemStatus.FAILED);
        });

        it('should log error if the person has no start password', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '1A',
            });
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([klasse]);

            const importvorgang: ImportVorgang<true> = DoFactory.createImportVorgang(true, {
                status: ImportStatus.VALID,
            });
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(importvorgang);
            const importDataItem: ImportDataItem<true> = DoFactory.createImportDataItem(true, {
                importvorgangId: importvorgang.id,
                klasse: '1A',
            });

            importDataRepositoryMock.findByImportVorgangId.mockResolvedValueOnce([[importDataItem], 1]);

            const person: Person<true> = DoFactory.createPerson(true);
            const pks: PersonPersonenkontext = {
                person: person,
                personenkontexte: [
                    DoFactory.createPersonenkontext(true, { organisationId: schule.id }),
                    DoFactory.createPersonenkontext(true, { organisationId: klasse.id }),
                ],
            };
            personenkontextCreationServiceMock.createPersonWithPersonenkontexte.mockResolvedValueOnce({
                ok: true,
                value: pks,
            });
            organisationRepoMock.findById.mockResolvedValueOnce(schule);
            importVorgangRepositoryMock.save.mockResolvedValueOnce(importvorgang);

            await sut.handleExecuteImport(event, () => undefined);

            expect(person.newPassword).toBeUndefined();
            expect(importDataItem.status).toEqual(ImportDataItemStatus.FAILED);
            expect(loggerMock.error).toHaveBeenCalledWith(`Person with ID ${person.id} has no start password!`);
        });

        it('should log info if the person and PKs were saved successfully', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '1A',
            });
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([klasse]);

            const importvorgang: ImportVorgang<true> = DoFactory.createImportVorgang(true, {
                status: ImportStatus.VALID,
            });
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(importvorgang);
            const importDataItem: ImportDataItem<true> = DoFactory.createImportDataItem(true, {
                importvorgangId: importvorgang.id,
                klasse: '1A',
            });

            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '5',
                faker.lorem.word(),
                faker.lorem.word(),
                faker.string.uuid(),
            );
            person.resetPassword();
            const pks: PersonPersonenkontext = {
                person: person,
                personenkontexte: [
                    DoFactory.createPersonenkontext(true, { organisationId: schule.id }),
                    DoFactory.createPersonenkontext(true, { organisationId: klasse.id }),
                ],
            };
            importDataRepositoryMock.findByImportVorgangId.mockResolvedValueOnce([[importDataItem], 1]);
            personenkontextCreationServiceMock.createPersonWithPersonenkontexte.mockResolvedValueOnce({
                ok: true,
                value: pks,
            });
            importVorgangRepositoryMock.save.mockResolvedValueOnce(importvorgang);

            await sut.handleExecuteImport(event, () => undefined);

            expect(loggerMock.info).toHaveBeenCalledWith(`Created user ${person.username} (${person.id}).`);
            expect(importVorgangRepositoryMock.save).toHaveBeenCalledTimes(2);
        });

        it('should call keepAlive for every person', async () => {
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '1A',
            });
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([klasse]);

            const importvorgang: ImportVorgang<true> = DoFactory.createImportVorgang(true, {
                status: ImportStatus.VALID,
            });
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(importvorgang);
            const importDataItem: ImportDataItem<true> = DoFactory.createImportDataItem(true, {
                importvorgangId: importvorgang.id,
                klasse: '1A',
            });

            const person: Person<true> = Person.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.person.lastName(),
                faker.person.firstName(),
                '5',
                faker.lorem.word(),
                faker.lorem.word(),
                faker.string.uuid(),
            );
            person.resetPassword();
            const pks: PersonPersonenkontext = {
                person: person,
                personenkontexte: [
                    DoFactory.createPersonenkontext(true, { organisationId: schule.id }),
                    DoFactory.createPersonenkontext(true, { organisationId: klasse.id }),
                ],
            };
            importDataRepositoryMock.findByImportVorgangId.mockResolvedValueOnce([[importDataItem], 1]);
            personenkontextCreationServiceMock.createPersonWithPersonenkontexte.mockResolvedValueOnce({
                ok: true,
                value: pks,
            });
            importVorgangRepositoryMock.save.mockResolvedValueOnce(importvorgang);

            const keepAlive: () => void = vi.fn();

            await sut.handleExecuteImport(event, keepAlive);

            expect(loggerMock.info).toHaveBeenCalledWith(`Created user ${person.username} (${person.id}).`);
            expect(importVorgangRepositoryMock.save).toHaveBeenCalledTimes(2);
            expect(keepAlive).toHaveBeenCalledTimes(1);
        });

        it('should handle an unexpected error during savePersonWithPersonenkontext and log it', async () => {
            const klassen: Organisation<true>[] = [
                DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, name: '1A' }),
            ];
            organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce(klassen);

            const importVorgang: ImportVorgang<true> = DoFactory.createImportVorgang(true, {
                status: ImportStatus.VALID,
            });
            importVorgangRepositoryMock.findById.mockResolvedValueOnce(importVorgang);

            const importDataItem: ImportDataItem<true> = DoFactory.createImportDataItem(true, { klasse: '1A' });
            importDataRepositoryMock.findByImportVorgangId.mockResolvedValueOnce([[importDataItem], 1]);

            const unexpectedError: Error = new Error('Unexpected error');
            personenkontextCreationServiceMock.createPersonWithPersonenkontexte.mockRejectedValueOnce(unexpectedError);
            importVorgangRepositoryMock.save.mockResolvedValueOnce(importVorgang);

            await sut.handleExecuteImport(event, () => undefined);

            expect(importDataItem.status).toBe(ImportDataItemStatus.FAILED);
            expect(loggerMock.logUnknownAsError).toHaveBeenCalledWith(
                `Unexpected error while processing item ${importDataItem.vorname} ${importDataItem.nachname}`,
                unexpectedError,
            );
            expect(importDataRepositoryMock.save).toHaveBeenCalledWith(importDataItem);
        });
    });
});
