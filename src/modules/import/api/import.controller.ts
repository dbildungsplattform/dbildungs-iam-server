import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseFilePipeBuilder,
    Post,
    Query,
    Res,
    StreamableFile,
    UploadedFile,
    UseFilters,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DbiamPersonenkontextImportBodyParams } from './dbiam-personenkontext-import.body.params.js';
import { ImportWorkflowFactory } from '../domain/import-workflow.factory.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { ImportResult, ImportUploadResultFields, ImportWorkflow } from '../domain/import-workflow.js';
import { DbiamImportError } from './dbiam-import.error.js';
import { ImportvorgangByIdBodyParams } from './importvorgang-by-id.body.params.js';
import { Response } from 'express';
import { ImportUploadResponse } from './importvorgang-upload.response.js';
import { ImportExceptionFilter } from './import-exception-filter.js';
import { ImportvorgangByIdParams } from './importvorgang-by-id.params.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ImportvorgangQueryParams } from './importvorgang-query.params.js';
import { PagingHeadersObject } from '../../../shared/paging/paging.enums.js';
import { ImportVorgangResponse } from './importvorgang.response.js';
import { ApiOkResponsePaginated, PagedResponse } from '../../../shared/paging/paged.response.js';
import { ImportVorgangRepository } from '../persistence/import-vorgang.repository.js';
import { ImportVorgang } from '../domain/import-vorgang.js';
import { Paged } from '../../../shared/paging/paged.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { ContentDisposition, ContentType } from '../../../shared/http/http.headers.js';
import { ImportVorgangStatusResponse } from './importvorgang-status.response.js';
import { ImportResultResponse } from './import-result.response.js';
import { ImportResultQueryParams } from './import-result-query.params.js';
import { ImportDataRepository } from '../persistence/import-data.repository.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';

@UseFilters(new ImportExceptionFilter())
@ApiTags('import')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'import' })
export class ImportController {
    public constructor(
        private readonly importWorkflowFactory: ImportWorkflowFactory,
        private readonly logger: ClassLogger,
        private readonly importVorgangRepository: ImportVorgangRepository,
        private readonly importDataRepository: ImportDataRepository,
    ) {}

    @UseGuards(StepUpGuard)
    @Post('upload')
    @ApiConsumes('multipart/form-data')
    @ApiOkResponse({ description: 'Returns an import upload response object.', type: ImportUploadResponse })
    @ApiBadRequestResponse({ description: 'The CSV file was not valid.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to import data with a CSV file.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to import data with a CSV file.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while importing data with a CSV file.' })
    @UseInterceptors(FileInterceptor('file'))
    public async uploadFile(
        @Body() body: DbiamPersonenkontextImportBodyParams,
        @UploadedFile(
            new ParseFilePipeBuilder()
                .addFileTypeValidator({
                    fileType: 'text/csv|application/vnd.ms-excel', //added application/vnd.ms-excel for firefox compatibility with csv files
                    skipMagicNumbersValidation: true,
                })
                .build({
                    errorHttpStatusCode: HttpStatus.BAD_REQUEST,
                    fileIsRequired: true,
                }),
        )
        file: Express.Multer.File,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<ImportUploadResponse> {
        const importWorkflow: ImportWorkflow = this.importWorkflowFactory.createNew();
        const result: DomainError | ImportUploadResultFields = await importWorkflow.validateImport(
            file,
            body.organisationId,
            body.rolleId,
            permissions,
        );
        if (result instanceof DomainError) {
            throw result;
        }

        return new ImportUploadResponse(
            result.importVorgangId,
            result.isValid,
            result.totalImportDataItems,
            result.invalidImportDataItems,
        );
    }

    @UseGuards(StepUpGuard)
    @ApiProduces('text/plain')
    @Post('execute')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse({
        description: 'The execution of the import transaction was initiated successfully.',
        type: undefined,
    })
    @ApiNotFoundResponse({ description: 'The import transaction does not exist.' })
    @ApiBadRequestResponse({
        description: 'Something went wrong with the found import transaction.',
        type: DbiamImportError,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to execute the import transaction.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to execute the import transaction.' })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error while executing the import transaction.',
    })
    public async executeImport(
        @Body() body: ImportvorgangByIdBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const importWorkflow: ImportWorkflow = this.importWorkflowFactory.createNew();
        const result: Result<void> = await importWorkflow.executeImport(body.importvorgangId, permissions);

        if (!result.ok) {
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat versucht mit dem Importvorgang: ${body.importvorgangId} einen CSV Import durchzuführen. Fehler: ${result.error.message}`,
            );
            throw result.error;
        }

        this.logger.info(
            `Admin: ${permissions.personFields.id}) hat mit dem Importvorgang: ${body.importvorgangId} einen CSV Import durchgeführt.`,
        );
    }

    @UseGuards(StepUpGuard)
    @Delete(':importvorgangId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ description: 'Delete a role by id.' })
    @ApiNoContentResponse({ description: 'Import transaction was deleted successfully.' })
    @ApiBadRequestResponse({
        description: 'Something went wrong with the found import transaction.',
        type: DbiamImportError,
    })
    @ApiNotFoundResponse({ description: 'The import transaction that should be deleted does not exist.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to delete the import transaction.' })
    public async deleteImportTransaction(
        @Param() params: ImportvorgangByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const importWorkflow: ImportWorkflow = this.importWorkflowFactory.createNew();
        const result: Result<void> = await importWorkflow.cancelOrCompleteImport(params.importvorgangId, permissions);
        if (!result.ok) {
            throw result.error;
        }
    }

    @UseGuards(StepUpGuard)
    @Get('history')
    @ApiOperation({ description: 'Get the history of import.' })
    @ApiOkResponsePaginated(ImportVorgangResponse, {
        description: 'The import transactions were successfully returned',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get import transactions.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get import transactions.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting import transactions.' })
    public async findImportTransactions(
        @Query() queryParams: ImportvorgangQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PagedResponse<ImportVorgangResponse>> {
        const [result, total]: [ImportVorgang<true>[], number] = await this.importVorgangRepository.findAuthorized(
            permissions,
            {
                status: queryParams.status,
                personId: permissions.personFields.id,
                rolleIds: queryParams.rolleIds,
                organisationIds: queryParams.organisationIds,
                offset: queryParams.offset,
                limit: queryParams.limit,
            },
        );

        const pagedImportVorgangResponse: Paged<ImportVorgangResponse> = {
            total: total,
            offset: queryParams.offset ?? 0,
            limit: queryParams.limit ?? result.length,
            items: result.map((importVorgang: ImportVorgang<true>) => new ImportVorgangResponse(importVorgang)),
        };

        return new PagedResponse(pagedImportVorgangResponse);
    }

    @UseGuards(StepUpGuard)
    @ApiOperation({
        deprecated: true,
        description:
            'Download the import result file by importvorgangId as text file is deprecated, please use the  GET/api/import/importedUsers.',
    })
    @ApiProduces('text/plain')
    @Get(':importvorgangId/download')
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({
        description: 'The import result file was generated and downloaded successfully.',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
    @ApiNotFoundResponse({ description: 'The import transaction does not exist.' })
    @ApiBadRequestResponse({
        description: 'Something went wrong with the found import transaction.',
        type: DbiamImportError,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to download the import result.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to download the import result.' })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error while generating the import result file.',
    })
    public async downloadFile(
        @Param() params: ImportvorgangByIdBodyParams,
        @Res({ passthrough: true }) res: Response,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<StreamableFile> {
        const importWorkflow: ImportWorkflow = this.importWorkflowFactory.createNew();
        const result: Result<Buffer, DomainError> = await importWorkflow.downloadFile(
            params.importvorgangId,
            permissions,
        );

        if (!result.ok) {
            throw result.error;
        } else {
            const fileName: string = importWorkflow.getFileName(params.importvorgangId);
            const contentDisposition: string = `attachment; filename="${fileName}"`;

            const headers: Record<string, string> = {};
            headers[ContentType] = 'text/plain';
            headers[ContentDisposition] = contentDisposition;
            res.set(headers);

            return new StreamableFile(result.value);
        }
    }

    @UseGuards(StepUpGuard)
    @Get(':importvorgangId/status')
    @ApiOperation({ description: 'Get status for the import transaction by id.' })
    @ApiOkResponse({
        description: 'The status for the import transaction was successfully returned.',
        type: ImportVorgangStatusResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get the status for the import transaction by id.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to get status for the import transaction by id.' })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error while getting status for the import transaction by id.',
    })
    public async getImportStatus(@Param() params: ImportvorgangByIdParams): Promise<ImportVorgangStatusResponse> {
        const importVorgang: Option<ImportVorgang<true>> = await this.importVorgangRepository.findById(
            params.importvorgangId,
        );
        if (!importVorgang) {
            throw new EntityNotFoundError('ImportVorgang', params.importvorgangId);
        }

        // Count processed items and add them to the response
        const processedItemCount: number = await this.importDataRepository.countProcessedItems(params.importvorgangId);

        return new ImportVorgangStatusResponse(importVorgang, processedItemCount);
    }

    @UseGuards(StepUpGuard)
    @Get('importedUsers')
    @ApiOperation({
        description:
            'Get the list of imported users. The maximum limit is 100. After receiving all the imported users, please use the DELETE endpoint to remove imported data.',
    })
    @ApiOkResponse({
        description: 'The list of imported users was successfully returned.',
        type: ImportResultResponse,
        headers: PagingHeadersObject,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get the list of imported users.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get list of imported users.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting list of imported users.' })
    public async getImportedUsers(
        @Query() queryParams: ImportResultQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<ImportResultResponse> {
        const importWorkflow: ImportWorkflow = this.importWorkflowFactory.createNew();
        const result: Result<ImportResult, DomainError> = await importWorkflow.getImportedUsers(
            permissions,
            queryParams.importvorgangId,
            queryParams.offset,
            queryParams.limit,
        );

        if (!result.ok) {
            throw result.error;
        }

        return new ImportResultResponse(result.value);
    }
}
