import { type ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import Papa, { type ParseResult } from 'papaparse';

import { type EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { type ClassLogger } from '../../../core/logging/class-logger.js';
import { type ImportConfig } from '../../../shared/config/import.config.js';
import { type ServerConfig } from '../../../shared/config/server.config.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { ImportExecutedEvent } from '../../../shared/events/import-executed.event.js';
import { KafkaImportExecutedEvent } from '../../../shared/events/kafka-import-executed.event.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleNurAnPassendeOrganisationError } from '../../personenkontext/specification/error/rolle-nur-an-passende-organisation.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { OrganisationMatchesRollenartError } from '../../rolle/domain/specification/error/organisation-matches-rollenart.error.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { type RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type ImportDataRepository } from '../persistence/import-data.repository.js';
import { type ImportVorgangRepository } from '../persistence/import-vorgang.repository.js';
import { CSVImportDataItemDTO } from './csv-import-data-item.dto.js';
import { ImportCSVFileContainsNoUsersError } from './import-csv-file-contains-no-users.error.js';
import { ImportCSVFileEmptyError } from './import-csv-file-empty.error.js';
import { ImportCSVFileInvalidHeaderError } from './import-csv-file-invalid-header.error.js';
import { ImportCSVFileMaxUsersError } from './import-csv-file-max-users.error.js';
import { ImportCSVFileParsingError } from './import-csv-file-parsing.error.js';
import { ImportDataItem } from './import-data-item.js';
import { ImportDomainError } from './import-domain.error.js';
import { ImportDomainErrorI18nTypes } from './import-i18n-errors.js';
import { ImportNurLernAnSchuleUndKlasseError } from './import-nur-lern-an-schule-und-klasse.error.js';
import { type ImportPasswordEncryptor } from './import-password-encryptor.js';
import { ImportResultMaxUsersError } from './import-result-max-users.error.js';
import { ImportTextFileCreationError } from './import-text-file-creation.error.js';
import { ImportVorgang } from './import-vorgang.js';
import { ImportStatus } from './import.enums.js';
import { ImportDataItemStatus } from './importDataItem.enum.js';
import { type IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';

export type ImportUploadResultFields = {
    importVorgangId: string;
    isValid: boolean;
    totalImportDataItems: number;
    totalInvalidImportDataItems: number;
    invalidImportDataItems: ImportDataItem<false>[];
};
export type OrganisationByIdAndName = Pick<Organisation<true>, 'id' | 'name'>;
export type TextFilePersonFields = {
    klasse: string | undefined;
    vorname: string;
    nachname: string;
    username: string | undefined;
    password: string | undefined;
};

export type RolleAndOrganisationByName = {
    rollenName: string;
    organisationsname: string;
};

export type ImportResult = {
    importvorgang: ImportVorgang<true>;
    importedDataItems: ImportDataItem<true>[];
    count: number;
};

export class ImportWorkflow {
    public readonly TEXT_FILENAME_NAME: string = '_spsh_csv_import_ergebnis.txt';

    public readonly CSV_FILE_VALID_HEADERS: string[] = ['nachname', 'vorname', 'klasse'];

    private CSV_MAX_NUMBER_OF_USERS!: number;

    private selectedOrganisationId!: string;

    private selectedRolleId!: string;

    private constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly importDataRepository: ImportDataRepository,
        private readonly importVorgangRepository: ImportVorgangRepository,
        private readonly importPasswordEncryptor: ImportPasswordEncryptor,
        private readonly eventService: EventRoutingLegacyKafkaService,
        private readonly logger: ClassLogger,
        private readonly config: ConfigService<ServerConfig>,
    ) {
        this.CSV_MAX_NUMBER_OF_USERS = this.config.getOrThrow<ImportConfig>('IMPORT').CSV_MAX_NUMBER_OF_USERS;
    }

    public static createNew(
        rolleRepo: RolleRepo,
        organisationRepository: OrganisationRepository,
        importDataRepository: ImportDataRepository,
        importVorgangRepository: ImportVorgangRepository,
        importPasswordEncryptor: ImportPasswordEncryptor,
        eventService: EventRoutingLegacyKafkaService,
        logger: ClassLogger,
        config: ConfigService<ServerConfig>,
    ): ImportWorkflow {
        return new ImportWorkflow(
            rolleRepo,
            organisationRepository,
            importDataRepository,
            importVorgangRepository,
            importPasswordEncryptor,
            eventService,
            logger,
            config,
        );
    }

    // Initialize the aggregate with the selected Organisation and Rolle
    private initialize(organisationId: string, rolleId: string): void {
        this.selectedOrganisationId = organisationId;
        this.selectedRolleId = rolleId;
    }

    // Check References and Permissions
    public async validateImport(
        file: Express.Multer.File,
        organisationId: string,
        rolleId: string,
        permissions: IPersonPermissions,
    ): Promise<DomainError | ImportUploadResultFields> {
        this.initialize(organisationId, rolleId);
        const referenceCheck: DomainError | RolleAndOrganisationByName = await this.checkReferences(
            this.selectedOrganisationId,
            this.selectedRolleId,
        );
        if (referenceCheck instanceof DomainError) {
            return referenceCheck;
        }

        const permissionCheckError: Option<DomainError> = await this.checkPermissions(permissions);
        if (permissionCheckError) {
            return permissionCheckError;
        }

        //Parse Data
        let parsedDataItems: CSVImportDataItemDTO[] = [];
        try {
            const parsedData: DomainError | ParseResult<CSVImportDataItemDTO> = await this.parseCSVFile(file);
            if (parsedData instanceof DomainError) {
                return parsedData;
            }

            if (parsedData.errors.length > 0) {
                return new ImportCSVFileParsingError(parsedData.errors);
            }

            if (parsedData.data.length === 0) {
                return new ImportCSVFileContainsNoUsersError();
            }

            parsedDataItems = plainToInstance(CSVImportDataItemDTO, parsedData.data);
        } catch (error) {
            if (error instanceof ImportCSVFileInvalidHeaderError) {
                return error;
            }
            return new ImportCSVFileParsingError([error]);
        }

        const klassenByIDandName: OrganisationByIdAndName[] = [];
        const klassen: Organisation<true>[] = await this.organisationRepository.findChildOrgasForIds([
            this.selectedOrganisationId,
        ]);
        klassen.forEach((value: Organisation<true>) => {
            if (value.typ === OrganisationsTyp.KLASSE) {
                klassenByIDandName.push({
                    id: value.id,
                    name: value.name,
                });
            }
        });

        const invalidImportDataItems: ImportDataItem<false>[] = [];

        if (permissions.personFields.username === undefined) {
            return new EntityNotFoundError('Person', permissions.personFields.id);
        }

        const importVorgang: ImportVorgang<false> = ImportVorgang.createNew(
            permissions.personFields.username,
            referenceCheck.rollenName,
            referenceCheck.organisationsname,
            parsedDataItems.length,
            permissions.personFields.id,
            this.selectedRolleId,
            this.selectedOrganisationId,
        );

        const savedImportvorgang: ImportVorgang<true> = await this.importVorgangRepository.save(importVorgang);
        const totalImportDataItems: number = parsedDataItems.length;
        while (parsedDataItems.length > 0) {
            const dataItems: CSVImportDataItemDTO[] = parsedDataItems.splice(0, 50);

            const importDataItems: ImportDataItem<false>[] = dataItems.map((value: CSVImportDataItemDTO) => {
                const importDataItemErrors: string[] = [];

                // Validate object
                for (const error of validateSync(value, { forbidUnknownValues: true })) {
                    if (error.constraints) {
                        for (const message of Object.values(error.constraints)) {
                            importDataItemErrors.push(message);
                        }
                    }
                }

                if (value.klasse) {
                    const klasse: OrganisationByIdAndName | undefined = klassenByIDandName.find(
                        (organisationByIdAndName: OrganisationByIdAndName) =>
                            organisationByIdAndName.name === value.klasse, //Klassennamen sind case sensitive
                    );

                    //Only check if the Klasse exists
                    //Do not need to check if the Klasse can be assigned to rolle for now, because we only impport RollenArt=LERN
                    if (!klasse) {
                        importDataItemErrors.push(ImportDomainErrorI18nTypes.IMPORT_DATA_ITEM_KLASSE_NOT_FOUND);
                    }
                }

                const importDataItem: ImportDataItem<false> = ImportDataItem.createNew(
                    savedImportvorgang.id,
                    value.nachname,
                    value.vorname,
                    ImportDataItemStatus.PENDING,
                    value.klasse,
                    value.personalnummer,
                    importDataItemErrors,
                );

                if (importDataItemErrors.length > 0) {
                    invalidImportDataItems.push(importDataItem);
                }

                return importDataItem;
            });

            // eslint-disable-next-line no-await-in-loop
            await this.importDataRepository.createAll(importDataItems);
        }

        savedImportvorgang.validate(invalidImportDataItems.length);
        await this.importVorgangRepository.save(savedImportvorgang);

        return {
            importVorgangId: savedImportvorgang.id,
            isValid: invalidImportDataItems.length === 0,
            totalImportDataItems: totalImportDataItems,
            totalInvalidImportDataItems: invalidImportDataItems.length,
            invalidImportDataItems,
        };
    }

    public async executeImport(importvorgangId: string, permissions: IPersonPermissions): Promise<Result<void>> {
        const importVorgangResult: Result<ImportVorgang<true>> = await this.checkPermissionsAndImportvorgangValidity(
            importvorgangId,
            permissions,
        );

        if (!importVorgangResult.ok) {
            return importVorgangResult;
        }

        if (importVorgangResult.value.status !== ImportStatus.VALID) {
            this.logger.error(
                `Importvorgang:${importvorgangId} does not have a valid status  (${importVorgangResult.value.status})`,
            );
            return {
                ok: false,
                error: new ImportDomainError('ImportVorgang does not have a valid status', importvorgangId),
            };
        }

        const importVorgang: ImportVorgang<true> = importVorgangResult.value;

        await this.importVorgangRepository.save(importVorgang);

        this.eventService.publish(
            new ImportExecutedEvent(
                importvorgangId,
                importVorgang.organisationId!,
                importVorgang.rolleId!,
                permissions.personFields.keycloakUserId!,
            ),
            new KafkaImportExecutedEvent(
                importvorgangId,
                importVorgang.organisationId!,
                importVorgang.rolleId!,
                permissions.personFields.keycloakUserId!,
            ),
        );

        return {
            ok: true,
            value: undefined,
        };
    }

    public async downloadFile(
        importvorgangId: string,
        permissions: IPersonPermissions,
    ): Promise<Result<Buffer, DomainError>> {
        const importVorgangResult: Result<ImportVorgang<true>> = await this.checkPermissionsAndImportvorgangValidity(
            importvorgangId,
            permissions,
        );

        if (!importVorgangResult.ok) {
            return {
                ok: false,
                error: importVorgangResult.error as DomainError,
            };
        }

        const importVorgang: ImportVorgang<true> = importVorgangResult.value;
        if (importVorgang.status !== ImportStatus.FINISHED) {
            return {
                ok: false,
                error: new ImportDomainError('ImportVorgang is still in progress', importvorgangId),
            };
        }

        // The type check for organisationId and rolleId is in a separate method checkPermissionsAndImportvorgangValidity() in the same file
        this.initialize(importVorgang.organisationId!, importVorgang.rolleId!);

        const [importDataItems, total]: Counted<ImportDataItem<true>> =
            await this.importDataRepository.findByImportVorgangId(importvorgangId);

        //TODO: Remove this in the next pagination ticket because we won't be creating the file in the backend anymore so we will just send all data items to the Frontend
        // There we will create the downloadable file with the successful data items and for the failed ones we just show them to the user separately.
        const successfulDataItems: ImportDataItem<true>[] = importDataItems.filter(
            (dataItem: ImportDataItem<true>) => dataItem.status === ImportDataItemStatus.SUCCESS,
        );

        if (total === 0) {
            return {
                ok: false,
                error: new EntityNotFoundError('ImportDataItem', importvorgangId),
            };
        }

        //Create text file.
        const result: Result<Buffer, DomainError> = await this.createTextFile(successfulDataItems);

        if (result.ok) {
            importVorgang.complete();
            await this.importDataRepository.deleteByImportVorgangId(importvorgangId);
            this.logger.info(
                `Der Importvorgang ${importvorgangId} ist abgeschlossen (status=${importVorgang.status}).`,
            );
        } else {
            importVorgang.fail();
        }

        await this.importVorgangRepository.save(importVorgang);
        return result;
    }

    public getFileName(importvorgangId: string): string {
        return importvorgangId + this.TEXT_FILENAME_NAME;
    }

    public async cancelOrCompleteImport(
        importvorgangId: string,
        permissions: IPersonPermissions,
    ): Promise<Result<void>> {
        const permissionCheckError: Option<DomainError> = await this.checkPermissions(permissions);
        if (permissionCheckError) {
            return {
                ok: false,
                error: permissionCheckError,
            };
        }

        const importVorgang: Option<ImportVorgang<true>> = await this.importVorgangRepository.findById(importvorgangId);
        if (!importVorgang) {
            return {
                ok: false,
                error: new EntityNotFoundError('ImportVorgang', importvorgangId),
            };
        }

        await this.importDataRepository.deleteByImportVorgangId(importvorgangId);

        if (importVorgang.status === ImportStatus.FINISHED) {
            importVorgang.complete();
        } else {
            importVorgang.cancel();
        }
        await this.importVorgangRepository.save(importVorgang);

        return {
            ok: true,
            value: undefined,
        };
    }

    public async getImportedUsers(
        permissions: IPersonPermissions,
        importvorgangId: string,
        offset?: number,
        limit?: number,
    ): Promise<Result<ImportResult, DomainError>> {
        const importVorgangResult: Result<ImportVorgang<true>> = await this.checkPermissionsAndImportvorgangValidity(
            importvorgangId,
            permissions,
        );

        if (!importVorgangResult.ok) {
            return {
                ok: false,
                error: importVorgangResult.error as DomainError,
            };
        }

        if (limit && limit > 100) {
            return {
                ok: false,
                error: new ImportResultMaxUsersError(),
            };
        }

        const [importDataItems, total]: Counted<ImportDataItem<true>> =
            await this.importDataRepository.findByImportVorgangId(importvorgangId, offset ?? 0, limit ?? 100);
        if (total === 0) {
            return {
                ok: false,
                error: new EntityNotFoundError('ImportDataItem', importvorgangId),
            };
        }

        const importedDataItems: ImportDataItem<true>[] = await Promise.all(
            importDataItems.map(async (importDataItem: ImportDataItem<true>) => {
                const password: string = await this.getDecryptedPassword(importDataItem);
                importDataItem.setPassword(password);

                return importDataItem;
            }),
        );

        return {
            ok: true,
            value: {
                importvorgang: importVorgangResult.value,
                importedDataItems,
                count: total,
            },
        };
    }

    private async checkReferences(
        organisationId: string,
        rolleId: string,
    ): Promise<DomainError | RolleAndOrganisationByName> {
        const [orga, rolle]: [Option<Organisation<true>>, Option<Rolle<true>>] = await Promise.all([
            this.organisationRepository.findById(organisationId),
            this.rolleRepo.findById(rolleId),
        ]);

        if (!orga) {
            return new EntityNotFoundError('Organisation', organisationId);
        }

        if (!rolle) {
            return new EntityNotFoundError('Rolle', rolleId);
        }

        //Check if the rolle is rollenart LERN (for now we can only import LERN)
        if (rolle.rollenart !== RollenArt.LERN) {
            return new ImportNurLernAnSchuleUndKlasseError();
        }

        // Can rolle be assigned at target orga
        const canAssignRolle: Result<void, EntityNotFoundError | OrganisationMatchesRollenartError> =
            await rolle.canBeAssignedToOrga(orga);
        if (!canAssignRolle.ok) {
            if (canAssignRolle.error instanceof OrganisationMatchesRollenartError) {
                return new RolleNurAnPassendeOrganisationError();
            }
            return canAssignRolle.error;
        }

        return {
            rollenName: rolle.name,
            organisationsname: orga.name ?? orga.kennung ?? orga.id,
        };
    }

    private async checkPermissions(permissions: IPersonPermissions): Promise<Option<DomainError>> {
        const hasPermissionAtOrga: boolean = await permissions.hasSystemrechteAtRootOrganisation([
            RollenSystemRecht.IMPORT_DURCHFUEHREN,
        ]);

        if (!hasPermissionAtOrga) {
            return new MissingPermissionsError('Unauthorized to import data');
        }

        return undefined;
    }

    private async parseCSVFile(file: Express.Multer.File): Promise<DomainError | ParseResult<CSVImportDataItemDTO>> {
        const csvContent: string = file.buffer.toString().replace(/['"]+/g, '');
        if (!csvContent) {
            return new ImportCSVFileEmptyError();
        }

        // This regex will matc the \n: Line ending for Unix-based systems and also the \r\n: Line ending for Windows systems.
        const numberOfRows: number = (csvContent.match(/\r?\n/g) || []).length;
        if (numberOfRows > this.CSV_MAX_NUMBER_OF_USERS) {
            return new ImportCSVFileMaxUsersError();
        }

        return new Promise<ParseResult<CSVImportDataItemDTO>>(
            (
                resolve: (
                    value: ParseResult<CSVImportDataItemDTO> | PromiseLike<ParseResult<CSVImportDataItemDTO>>,
                ) => void,
            ) => {
                Papa.parse<CSVImportDataItemDTO>(csvContent, {
                    delimiter: ';',
                    delimitersToGuess: [';'],
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: (header: string) => {
                        const trimmedHeader: string = header.toLowerCase().trim();
                        if (!this.CSV_FILE_VALID_HEADERS.includes(trimmedHeader)) {
                            throw new ImportCSVFileInvalidHeaderError([`Invalid header: ${header}`]);
                        }

                        return trimmedHeader;
                    },
                    transform: (value: string): string => {
                        return value.trim();
                    },
                    complete: (results: ParseResult<CSVImportDataItemDTO>) => {
                        return resolve(results);
                    },
                });
            },
        );
    }

    private async createTextFile(importedDataItems: ImportDataItem<true>[]): Promise<Result<Buffer, DomainError>> {
        const [orga, rolle]: [Option<Organisation<true>>, Option<Rolle<true>>] = await Promise.all([
            this.organisationRepository.findById(this.selectedOrganisationId),
            this.rolleRepo.findById(this.selectedRolleId),
        ]);

        if (!orga) {
            return {
                ok: false,
                error: new EntityNotFoundError('Organisation', this.selectedOrganisationId),
            };
        }

        if (!rolle) {
            return {
                ok: false,
                error: new EntityNotFoundError('Rolle', this.selectedRolleId),
            };
        }

        let fileContent: string = '';

        const headerImportInfo: string = `Schule:${orga.name} - Rolle:${rolle.name}`;
        const headerUserInfo: string = '\n\nKlasse - Vorname - Nachname - Benutzername - Passwort';
        fileContent += headerImportInfo + headerUserInfo;

        for (const importedDataItem of importedDataItems) {
            // eslint-disable-next-line no-await-in-loop
            const password: string = await this.getDecryptedPassword(importedDataItem);

            const userInfo: string = `\n${importedDataItem.klasse} - ${importedDataItem.vorname} - ${importedDataItem.nachname} - ${importedDataItem.username} - ${password}`;
            fileContent += userInfo;
        }

        try {
            const buffer: Buffer = Buffer.from(fileContent, 'utf8');
            return {
                ok: true,
                value: buffer,
            };
        } catch (error) {
            return {
                ok: false,
                error: new ImportTextFileCreationError([String(error)]),
            };
        }
    }

    private async checkPermissionsAndImportvorgangValidity(
        importvorgangId: string,
        permissions: IPersonPermissions,
    ): Promise<Result<ImportVorgang<true>>> {
        const permissionCheckError: Option<DomainError> = await this.checkPermissions(permissions);
        if (permissionCheckError) {
            return {
                ok: false,
                error: permissionCheckError,
            };
        }

        const importVorgang: Option<ImportVorgang<true>> = await this.importVorgangRepository.findById(importvorgangId);
        if (!importVorgang) {
            this.logger.warning(`Importvorgang: ${importvorgangId} not found`);
            return {
                ok: false,
                error: new EntityNotFoundError('ImportVorgang', importvorgangId),
            };
        }

        if (!importVorgang.organisationId) {
            this.logger.error(`Importvorgang:${importvorgangId} does not have an organisation id`);
            return {
                ok: false,
                error: new ImportDomainError('ImportVorgang is missing an organisation id', importvorgangId),
            };
        }
        if (!importVorgang.rolleId) {
            this.logger.error(`Importvorgang:${importvorgangId} does not have a rolle id`);
            return {
                ok: false,
                error: new ImportDomainError('ImportVorgang is missing a rolle id', importvorgangId),
            };
        }

        return {
            ok: true,
            value: importVorgang,
        };
    }

    private async getDecryptedPassword(importedDataItem: ImportDataItem<true>): Promise<string> {
        let password: string = ''; //will never happen that the password is empty
        if (importedDataItem.password) {
            password = await this.importPasswordEncryptor.decryptPassword(
                importedDataItem.password,
                importedDataItem.importvorgangId,
            );
        }

        return password;
    }
}
