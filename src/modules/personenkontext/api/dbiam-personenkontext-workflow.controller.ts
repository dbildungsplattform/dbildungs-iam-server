import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseFilters, UseGuards } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { DuplicatePersonalnummerError } from '../../../shared/error/duplicate-personalnummer.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { PersonenkontextCommitError } from '../domain/error/personenkontext-commit.error.js';
import { LandesbediensteteKontextWorkflowService } from '../domain/landesbedienstete-kontext-workflow.service.js';
import { PersonPersonenkontext, PersonenkontextCreationService } from '../domain/personenkontext-creation.service.js';
import { PersonenkontextWorkflowFactory } from '../domain/personenkontext-workflow.factory.js';
import { PersonenkontextWorkflowAggregate } from '../domain/personenkontext-workflow.js';
import { OperationContext } from '../domain/personenkontext.enums.js';
import { Personenkontext } from '../domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextError } from './dbiam-personenkontext.error.js';
import { DbiamCreatePersonWithPersonenkontexteBodyParams } from './param/dbiam-create-person-with-personenkontexte.body.params.js';
import { DbiamCreatePersonenkontextBodyParams } from './param/dbiam-create-personenkontext.body.params.js';
import { FindDbiamPersonenkontextWorkflowQueryParams } from './param/dbiam-find-personenkontextworkflow-query.params.js';
import { PersonenkontextExceptionFilter } from './personenkontext-exception-filter.js';
import { PersonenkontexteUpdateExceptionFilter } from './personenkontexte-update-exception-filter.js';
import { DBiamPersonResponse } from './response/dbiam-person.response.js';
import { PersonenkontextWorkflowResponse } from './response/dbiam-personenkontext-workflow-response.js';

@UseFilters(new PersonenkontextExceptionFilter(), new PersonenkontexteUpdateExceptionFilter())
@ApiTags('personenkontext')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'personenkontext-workflow' })
export class DbiamPersonenkontextWorkflowController {
    public constructor(
        private readonly personenkontextWorkflowFactory: PersonenkontextWorkflowFactory,
        private readonly landesbediensteteKontextWorkflowService: LandesbediensteteKontextWorkflowService,
        private readonly personenkontextCreationService: PersonenkontextCreationService,
        private readonly logger: ClassLogger,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
    ) {}

    @Get('step')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'Check whether the selected roles can be committed for the selected organisation.',
        type: PersonenkontextWorkflowResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available data for personenkontext.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to get data for personenkontext.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting data for personenkontext.' })
    public async processStep(
        @Query() params: FindDbiamPersonenkontextWorkflowQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonenkontextWorkflowResponse> {
        // Creates a new instance of the workflow aggregate
        const anlage: PersonenkontextWorkflowAggregate = this.personenkontextWorkflowFactory.createNew();

        // Initializes the aggregate with the values of the person, the selected organisation and rolle through the UI
        anlage.initialize(params.personId, params.organisationId, params.rollenIds);

        if (params.personId) {
            const findByPersonResult: Result<Personenkontext<true>[], MissingPermissionsError> =
                await this.personenkontextRepo.findByPersonAuthorized(params.personId, permissions);
            if (!findByPersonResult.ok) {
                return new PersonenkontextWorkflowResponse(false, params.organisationId, params.rollenIds);
            }
        }

        // Determine canCommit status, by default it's always false unless both the rolle and orga are selected
        let canCommit: boolean = false;
        if (params.organisationId && params.rollenIds) {
            let commitResult: Result<void, DomainError>;
            if (params.operationContext === OperationContext.LANDESBEDIENSTETEN_KONTEXT_ERWEITERN) {
                // Additional logic for this operation context can be added here
                commitResult = await this.landesbediensteteKontextWorkflowService.canCommit(
                    params.rollenIds,
                    params.organisationId,
                    permissions,
                );
            } else {
                commitResult = await anlage.canCommit(permissions, params.operationContext);
            }

            if (commitResult.ok) {
                canCommit = true;
            }
        }

        return new PersonenkontextWorkflowResponse(canCommit, params.organisationId, params.rollenIds);
    }

    @Post()
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.CREATED)
    @ApiCreatedResponse({
        description: 'Person with Personenkontext was successfully created.',
        type: DBiamPersonResponse,
    })
    @ApiBadRequestResponse({
        description: 'The person and the personenkontext could not be created, may due to unsatisfied specifications.',
        type: DbiamPersonenkontextError,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to create person with personenkontext.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to create person with personenkontext.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to create the person with personenkontext.' })
    @ApiBadRequestResponse({ description: 'Request has wrong format.', type: DbiamPersonenkontextError })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error while creating person with personenkontext.',
    })
    public async createPersonWithPersonenkontexte(
        @Body() params: DbiamCreatePersonWithPersonenkontexteBodyParams,
        @Permissions() permissions: PersonPermissions,
    ): Promise<DBiamPersonResponse> {
        //Check all references & permissions then save person
        const savedPersonWithPersonenkontextResult: Result<
            PersonPersonenkontext,
            DomainError | PersonenkontextCommitError | DuplicatePersonalnummerError
        > = await this.personenkontextCreationService.createPersonWithPersonenkontexte(
            permissions,
            params.vorname,
            params.familienname,
            params.createPersonenkontexte,
            params.personalnummer || undefined,
            params.befristung || undefined,
        );
        if (!savedPersonWithPersonenkontextResult.ok) {
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat versucht einen neuen Benutzer für ${params.vorname} ${params.familienname} anzulegen. Fehler:  ${savedPersonWithPersonenkontextResult.error.message}`,
            );
            params.createPersonenkontexte.forEach((kontextParams: DbiamCreatePersonenkontextBodyParams) => {
                const rolleId: string = kontextParams.rolleId;
                const organisationId: string = kontextParams.organisationId;
                this.logger.error(
                    `Benutzer für ${params.vorname} ${params.familienname} mit Rolle ${rolleId} und Organisation ${organisationId} anzulegen ist fehlgeschlagen.`,
                );
            });
            throw savedPersonWithPersonenkontextResult.error;
        }

        this.logger.info(
            `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat neuen Benutzer ${savedPersonWithPersonenkontextResult.value.person.username} (${savedPersonWithPersonenkontextResult.value.person.id}) angelegt.`,
        );
        await Promise.all(
            savedPersonWithPersonenkontextResult.value.personenkontexte.map(
                async (personenKontext: Personenkontext<true>) => {
                    const rolle: Option<Rolle<true>> = await personenKontext.getRolle();
                    const organisation: Option<Organisation<true>> = await personenKontext.getOrganisation();
                    this.logger.info(
                        `Benutzer ${savedPersonWithPersonenkontextResult.value.person.username} angelegt mit Rolle: ${rolle?.name} (${rolle?.id}), und Organisation: ${organisation?.name} (${organisation?.id}).`,
                    );
                },
            ),
        );

        return new DBiamPersonResponse(
            savedPersonWithPersonenkontextResult.value.person,
            savedPersonWithPersonenkontextResult.value.personenkontexte,
        );
    }
}
