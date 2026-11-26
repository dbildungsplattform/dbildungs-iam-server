import { Body, Controller, Param, Post, Put, Query, UseFilters, UseGuards } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DomainError } from '../../../shared/error/domain.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { type PersonID } from '../../../shared/types/index.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { DbiamPersonenkontextFactory } from '../domain/dbiam-personenkontext.factory.js';
import { LandesbediensteteKontextWorkflowService } from '../domain/landesbedienstete-kontext-workflow.service.js';
import { Personenkontext } from '../domain/personenkontext.js';
import { DbiamPersonenkontexteUpdateError } from './dbiam-personenkontexte-update.error.js';
import { DBiamFindPersonenkontexteByPersonIdParams } from './param/dbiam-find-personenkontext-by-personid.params.js';
import { DbiamPersonenkontextBodyParams } from './param/dbiam-personenkontext.body.params.js';
import { DbiamUpdatePersonenkontexteQueryParams } from './param/dbiam-update-personenkontexte.query.params.js';
import { LandesbedienstetenzuordnungHinzufuegenBodyParams } from './param/landesbedienstetenzuordnung-hinzufuegen.body.params.js';
import { PersonenzuordnungBodyParams } from './param/personenzuordnung.body.params.js';
import { PersonenzuordnungenBearbeitenBodyParams } from './param/personenzuordnungen-bearbeiten.body.params.js';
import { PersonenkontextExceptionFilter } from './personenkontext-exception-filter.js';
import { PersonenkontexteUpdateExceptionFilter } from './personenkontexte-update-exception-filter.js';
import { PersonenkontexteUpdateResponse } from './response/personenkontexte-update.response.js';

@UseFilters(new PersonenkontextExceptionFilter(), new PersonenkontexteUpdateExceptionFilter())
@UseGuards(StepUpGuard)
@ApiTags('personenkontext')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@ApiUnauthorizedResponse({ description: 'Not authorized to modify assignments.' })
@ApiForbiddenResponse({ description: 'Insufficient permission to modify assignments.' })
@ApiBadRequestResponse({
    description: 'Invalid request, outdated assignment snapshot, or unsatisfied assignment rules.',
    type: DbiamPersonenkontexteUpdateError,
})
@Controller({ path: 'personenkontexte' })
export class PersonenkontextController {
    public constructor(
        private readonly personenkontextFactory: DbiamPersonenkontextFactory,
        private readonly landesbediensteteKontextWorkflowService: LandesbediensteteKontextWorkflowService,
    ) {}

    @Put('person/:personId')
    @ApiOkResponse({
        description: 'Replaces the assignment set and returns all assignments after the update.',
        type: PersonenkontexteUpdateResponse,
    })
    public async bearbeitePersonenzuordnungen(
        @Param() { personId }: DBiamFindPersonenkontexteByPersonIdParams,
        @Query() { personalnummer }: DbiamUpdatePersonenkontexteQueryParams,
        @Body() { lastModified, count, personenkontexte }: PersonenzuordnungenBearbeitenBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonenkontexteUpdateResponse> {
        const result: Personenkontext<true>[] | DomainError = await this.personenkontextFactory
            .createNewPersonenkontexteUpdate(
                personId,
                lastModified,
                count,
                this.toPersonenkontextBodyParams(personId, personenkontexte),
                permissions,
                personalnummer || undefined,
            )
            .update();

        return this.toResponse(result);
    }

    @Post('person/:personId/landesbedienstetenzuordnungen')
    @ApiCreatedResponse({
        description: 'Adds assignments via the Landesbedienstete search flow and returns the resulting assignment set.',
        type: PersonenkontexteUpdateResponse,
    })
    public async fuegeLandesbedienstetenzuordnungHinzu(
        @Param() { personId }: DBiamFindPersonenkontexteByPersonIdParams,
        @Query() { personalnummer }: DbiamUpdatePersonenkontexteQueryParams,
        @Body() { lastModified, count, personenkontexte }: LandesbedienstetenzuordnungHinzufuegenBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonenkontexteUpdateResponse> {
        const result: Personenkontext<true>[] | DomainError = await this.landesbediensteteKontextWorkflowService.commit(
            personId,
            lastModified,
            count,
            this.toPersonenkontextBodyParams(personId, personenkontexte),
            permissions,
            personalnummer || undefined,
        );

        return this.toResponse(result);
    }

    private toPersonenkontextBodyParams(
        personId: PersonID,
        personenkontexte: readonly PersonenzuordnungBodyParams[],
    ): DbiamPersonenkontextBodyParams[] {
        return personenkontexte.map((pk: PersonenzuordnungBodyParams) => ({ ...pk, personId }));
    }

    private toResponse(result: Personenkontext<true>[] | DomainError): PersonenkontexteUpdateResponse {
        if (result instanceof DomainError) {
            throw result;
        }
        return new PersonenkontexteUpdateResponse(result);
    }
}
