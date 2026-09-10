import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Query,
    UseFilters,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
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
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationResponseLegacy } from '../../organisation/api/organisation.response.legacy.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { RolleFindService } from '../../rolle/domain/rolle-find.service.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { PersonenkontextCommitError } from '../domain/error/personenkontext-commit.error.js';
import { PersonenkontexteUpdateError } from '../domain/error/personenkontexte-update.error.js';
import { PersonPersonenkontext, PersonenkontextCreationService } from '../domain/personenkontext-creation.service.js';
import { PersonenkontextWorkflowFactory } from '../domain/personenkontext-workflow.factory.js';
import { PersonenkontextWorkflowAggregate } from '../domain/personenkontext-workflow.js';
import { Personenkontext } from '../domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DbiamPersonenkontextError } from './dbiam-personenkontext.error.js';
import { DbiamPersonenkontexteUpdateError } from './dbiam-personenkontexte-update.error.js';
import { DbiamCreatePersonWithPersonenkontexteBodyParams } from './param/dbiam-create-person-with-personenkontexte.body.params.js';
import { DbiamCreatePersonenkontextBodyParams } from './param/dbiam-create-personenkontext.body.params.js';
import { DBiamFindPersonenkontexteByPersonIdParams } from './param/dbiam-find-personenkontext-by-personid.params.js';
import { FindDbiamPersonenkontextWorkflowBodyParams } from './param/dbiam-find-personenkontextworkflow-body.params.js';
import { DbiamUpdatePersonenkontexteBodyParams } from './param/dbiam-update-personenkontexte.body.params.js';
import { DbiamUpdatePersonenkontexteQueryParams } from './param/dbiam-update-personenkontexte.query.params.js';
import { PersonenkontextExceptionFilter } from './personenkontext-exception-filter.js';
import { PersonenkontexteUpdateExceptionFilter } from './personenkontexte-update-exception-filter.js';
import { DBiamPersonResponse } from './response/dbiam-person.response.js';
import { PersonenkontextWorkflowResponse } from './response/dbiam-personenkontext-workflow-response.js';
import { PersonenkontexteUpdateResponse } from './response/personenkontexte-update.response.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';

@UseFilters(new PersonenkontextExceptionFilter(), new PersonenkontexteUpdateExceptionFilter())
@ApiTags('personenkontext')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'personenkontext-workflow' })
export class DbiamPersonenkontextWorkflowController {
    public constructor(
        private readonly personenkontextWorkflowFactory: PersonenkontextWorkflowFactory,
        private readonly personenkontextCreationService: PersonenkontextCreationService,
        private readonly rolleFindService: RolleFindService,
        private readonly logger: ClassLogger,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
    ) {}

    @Get('step')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: `Initialize or process data from the person creation form.
                      Valid combinations:
                      - Both organisationId and rolleId are undefined: Fetch all possible organisations.
                      - organisationId is provided, but rolleId is undefined: Fetch Rollen for the given organisation.
                      - Both organisationId and rolleId are provided: Check if the Rolle can be committed for the organisation.
                      Note: Providing rolleId without organisationId is invalid.`,
        type: PersonenkontextWorkflowResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available data for personenkontext.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to get data for personenkontext.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting data for personenkontext.' })
    public async processStep(
        @Query() params: FindDbiamPersonenkontextWorkflowBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonenkontextWorkflowResponse> {
        // Creates a new instance of the workflow aggregate
        const anlage: PersonenkontextWorkflowAggregate = this.personenkontextWorkflowFactory.createNew();

        // Initializes the aggregate with the values of the person, the selected organisation and rolle through the UI
        anlage.initialize(params.personId, params.organisationId, params.rollenIds);

        // Find all possible SSKs (Possibly through name if the name was given)
        const organisations: Organisation<true>[] = await anlage.findAllSchulstrukturknoten(
            permissions,
            params.organisationName,
            params.limit,
        );

        let rollenart: RollenArt | undefined;
        if (params.personId) {
            const findByPersonResult: Result<Personenkontext<true>[], MissingPermissionsError> =
                await this.personenkontextRepo.findByPersonAuthorized(params.personId, permissions);
            if (!findByPersonResult.ok) {
                return new PersonenkontextWorkflowResponse(
                    organisations.map(
                        (organisation: Organisation<true>) => new OrganisationResponseLegacy(organisation),
                    ),
                    [],
                    false,
                    params.organisationId,
                    params.rollenIds,
                );
            }
            const pks: Array<Personenkontext<true>> = findByPersonResult.value;
            const rolle: Option<Rolle<true>> = await pks[0]?.getRolle();
            if (rolle) {
                rollenart = rolle.rollenart;
            }
        }

        // Find all possible roles under the selected Organisation
        const [rollen]: Counted<Rolle<true>> = params.organisationId
            ? await this.rolleFindService.findRollenAvailableForPersonenkontextCreation({
                  permissions,
                  rollenartOfUser: rollenart,
                  rolleName: params.rolleName,
                  rollenIds: params.rollenIds,
                  limit: params.limit,
                  organisationId: params.organisationId,
                  systemrecht: params.requestedWithSystemrecht
                      ? RollenSystemRecht.getByName(params.requestedWithSystemrecht)
                      : RollenSystemRecht.PERSONEN_VERWALTEN,
              })
            : [[], 0];

        const organisationsResponse: OrganisationResponseLegacy[] = organisations.map(
            (org: Organisation<true>) => new OrganisationResponseLegacy(org),
        );

        // Determine canCommit status, by default it's always false unless both the rolle and orga are selected
        let canCommit: boolean = false;
        if (params.organisationId && params.rollenIds) {
            const commitResult: DomainError | boolean = await anlage.canCommit(permissions, params.operationContext);
            if (commitResult === true) {
                canCommit = true;
            }
        }

        const response: PersonenkontextWorkflowResponse = new PersonenkontextWorkflowResponse(
            organisationsResponse,
            rollen,
            canCommit,
            params.organisationId,
            params.rollenIds,
        );

        return response;
    }

    @Put(':personId')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({
        description:
            'Add or remove personenkontexte as one operation. Returns the Personenkontexte existing after update.',
        type: PersonenkontexteUpdateResponse,
    })
    @ApiBadRequestResponse({
        description: 'The personenkontexte could not be updated, may due to unsatisfied specifications.',
        type: DbiamPersonenkontexteUpdateError,
    })
    @ApiConflictResponse({ description: 'Changes are conflicting with current state of personenkontexte.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to update personenkontexte.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to update personenkontexte.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while updating personenkontexte.' })
    public async commit(
        @Param() params: DBiamFindPersonenkontexteByPersonIdParams,
        @Query() queryParams: DbiamUpdatePersonenkontexteQueryParams,
        @Body() bodyParams: DbiamUpdatePersonenkontexteBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonenkontexteUpdateResponse> {
        const updateResult: Personenkontext<true>[] | PersonenkontexteUpdateError =
            await this.personenkontextWorkflowFactory
                .createNew()
                .commit(
                    params.personId,
                    bodyParams.lastModified,
                    bodyParams.count,
                    bodyParams.personenkontexte,
                    permissions,
                    queryParams.personalnummer || undefined,
                );

        if (updateResult instanceof PersonenkontexteUpdateError) {
            throw updateResult;
        }

        if (updateResult instanceof DuplicatePersonalnummerError) {
            throw updateResult;
        }
        return new PersonenkontexteUpdateResponse(updateResult);
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
