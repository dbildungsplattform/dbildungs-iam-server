import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { ImportDataRepository } from '../persistence/import-data.repository.js';
import {
    PersonenkontextCreationService,
    PersonPersonenkontext,
} from '../../personenkontext/domain/personenkontext-creation.service.js';
import { DbiamCreatePersonenkontextBodyParams } from '../../personenkontext/api/param/dbiam-create-personenkontext.body.params.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { ImportDataItem } from './import-data-item.js';
import { ImportVorgang } from './import-vorgang.js';
import { ImportVorgangRepository } from '../persistence/import-vorgang.repository.js';
import { ImportExecutedEvent } from '../../../shared/events/import-executed.event.js';
import { EventHandler } from '../../../core/eventbus/decorators/event-handler.decorator.js';
import { OrganisationByIdAndName } from './import-workflow.js';
import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ImportPasswordEncryptor } from './import-password-encryptor.js';
import { ImportDataItemStatus } from './importDataItem.enum.js';
import { KafkaEventHandler } from '../../../core/eventbus/decorators/kafka-event-handler.decorator.js';
import { KafkaImportExecutedEvent } from '../../../shared/events/kafka-import-executed.event.js';
import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { PersonPermissionsRepo } from '../../authentication/domain/person-permission.repo.js';
import { ImportStatus } from './import.enums.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';

@Injectable()
export class ImportEventHandler {
    public selectedOrganisationId!: string;

    public selectedRolleId!: string;

    public constructor(
        private readonly organisationRepository: OrganisationRepository,
        private readonly importDataRepository: ImportDataRepository,
        private readonly personenkontextCreationService: PersonenkontextCreationService,
        private readonly importVorgangRepository: ImportVorgangRepository,
        private readonly importPasswordEncryptor: ImportPasswordEncryptor,
        private readonly permissionsRepo: PersonPermissionsRepo,
        private readonly logger: ClassLogger,
        // @ts-expect-error used by EnsureRequestContext decorator
        // Although not accessed directly, MikroORM's @EnsureRequestContext() uses this.em internally
        // to create the request-bound EntityManager context. Removing it would break context creation.
        private readonly em: EntityManager,
    ) {}

    @KafkaEventHandler(KafkaImportExecutedEvent)
    @EventHandler(ImportExecutedEvent)
    @EnsureRequestContext()
    public async handleExecuteImport(
        event: ImportExecutedEvent,
        keepAlive: () => void,
        signal?: AbortSignal,
    ): Promise<void> {
        this.selectedOrganisationId = event.organisationId;
        this.selectedRolleId = event.rolleId;

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

        const importvorgangId: string = event.importVorgangId;
        let importVorgang: Option<ImportVorgang<true>> = await this.importVorgangRepository.findById(importvorgangId);
        if (!importVorgang) {
            throw new EntityNotFoundError('ImportVorgang', importvorgangId);
        }

        if (importVorgang.status !== ImportStatus.VALID) {
            return this.logger.logUnknownAsError(
                'Could not start ImportVorgang, because it did not have a valid state',
                { id: importvorgangId, status: importVorgang.status },
            );
        }

        importVorgang.execute();
        importVorgang = await this.importVorgangRepository.save(importVorgang);

        const [importDataItems, total]: Counted<ImportDataItem<true>> =
            await this.importDataRepository.findByImportVorgangId(importvorgangId);

        if (total === 0) {
            return this.logger.error(`No import data items found for Importvorgang:${importvorgangId}`);
        }

        let allItemsFailed: boolean = true;

        // Load fresh permissions because we can't serialize the permissions object when using kafka
        const permissions: IPersonPermissions = await this.permissionsRepo.loadPersonPermissions(
            event.importerKeycloakId,
        );

        for (const dataItem of importDataItems) {
            if (signal?.aborted) {
                importVorgang.fail();
                // eslint-disable-next-line no-await-in-loop
                await this.importVorgangRepository.save(importVorgang);
                this.logger.error(`ImportVorgang ${importvorgangId} was aborted before all items were imported`);
                signal.throwIfAborted();
            }

            // Make sure to call keepAlive for larger imports
            keepAlive();

            // eslint-disable-next-line no-await-in-loop
            await this.savePersonWithPersonenkontext(dataItem, klassenByIDandName, permissions);

            if (dataItem.status === ImportDataItemStatus.SUCCESS) {
                allItemsFailed = false; // if at least one item succeeded then the import process won't fail
            }
        }

        // Finalize the import process depending on the status on the items. If all items failed to be imported then we mark the whole import as failed. Otherwise it's finished.
        if (allItemsFailed) {
            importVorgang.fail();
        } else {
            importVorgang.finish();
        }
        await this.importVorgangRepository.save(importVorgang);
    }

    private async savePersonWithPersonenkontext(
        importDataItem: ImportDataItem<true>,
        klassenByIDandName: OrganisationByIdAndName[],
        permissions: IPersonPermissions,
    ): Promise<void> {
        try {
            const klasse: OrganisationByIdAndName | undefined = klassenByIDandName.find(
                (organisationByIdAndName: OrganisationByIdAndName) =>
                    organisationByIdAndName.name === importDataItem.klasse,
            );

            if (!klasse) {
                this.logger.error(
                    `Klasse=${importDataItem.klasse} for ${importDataItem.vorname} ${importDataItem.nachname} was not found.`,
                );
                importDataItem.status = ImportDataItemStatus.FAILED;
                await this.importDataRepository.save(importDataItem);
                return;
            }

            const createPersonenkontexte: DbiamCreatePersonenkontextBodyParams[] = [
                {
                    organisationId: this.selectedOrganisationId,
                    rolleId: this.selectedRolleId,
                },
                {
                    organisationId: klasse.id,
                    rolleId: this.selectedRolleId,
                },
            ];

            const savedPersonWithPersonenkontext: Result<PersonPersonenkontext, DomainError> =
                await this.personenkontextCreationService.createPersonWithPersonenkontexte(
                    permissions,
                    importDataItem.vorname,
                    importDataItem.nachname,
                    createPersonenkontexte,
                );

            if (!savedPersonWithPersonenkontext.ok) {
                this.logger.error(
                    `Failed to create user for ${importDataItem.vorname} ${importDataItem.nachname}. Error: ${savedPersonWithPersonenkontext.error.message}`,
                );
                importDataItem.status = ImportDataItemStatus.FAILED;
                await this.importDataRepository.save(importDataItem);
                return;
            }

            if (!savedPersonWithPersonenkontext.value.person.newPassword) {
                this.logger.error(
                    `Person with ID ${savedPersonWithPersonenkontext.value.person.id} has no start password!`,
                );
                importDataItem.status = ImportDataItemStatus.FAILED;

                await this.importDataRepository.save(importDataItem);
                return;
            }

            importDataItem.username = savedPersonWithPersonenkontext.value.person.username;
            importDataItem.password = await this.importPasswordEncryptor.encryptPassword(
                savedPersonWithPersonenkontext.value.person.newPassword,
            );
            importDataItem.status = ImportDataItemStatus.SUCCESS;
            await this.importDataRepository.save(importDataItem);

            this.logger.info(
                `Created user ${savedPersonWithPersonenkontext.value.person.username} (${savedPersonWithPersonenkontext.value.person.id}).`,
            );
        } catch (error) {
            this.logger.logUnknownAsError(
                `Unexpected error while processing item ${importDataItem.vorname} ${importDataItem.nachname}`,
                error,
            );
            importDataItem.status = ImportDataItemStatus.FAILED;
            await this.importDataRepository.save(importDataItem);
        }
    }
}
