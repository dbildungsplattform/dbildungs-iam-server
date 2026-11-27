import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters, UseGuards } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiOAuth2,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { DuplicatePersonalnummerError } from '../../../shared/error/duplicate-personalnummer.error.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { PersonenkontextCommitError } from '../domain/error/personenkontext-commit.error.js';
import { PersonPersonenkontext, PersonenkontextCreationService } from '../domain/personenkontext-creation.service.js';
import { Personenkontext } from '../domain/personenkontext.js';
import { DbiamPersonenkontextError } from './dbiam-personenkontext.error.js';
import { DbiamCreatePersonWithPersonenkontexteBodyParams } from './param/dbiam-create-person-with-personenkontexte.body.params.js';
import { DbiamCreatePersonenkontextBodyParams } from './param/dbiam-create-personenkontext.body.params.js';
import { PersonenkontextExceptionFilter } from './personenkontext-exception-filter.js';
import { PersonenkontexteUpdateExceptionFilter } from './personenkontexte-update-exception-filter.js';
import { DBiamPersonResponse } from './response/dbiam-person.response.js';

@UseFilters(new PersonenkontextExceptionFilter(), new PersonenkontexteUpdateExceptionFilter())
@ApiTags('personenkontext')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'personenkontext-workflow' })
export class DbiamPersonenkontextWorkflowController {
    public constructor(
        private readonly personenkontextCreationService: PersonenkontextCreationService,
        private readonly logger: ClassLogger,
    ) {}

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
