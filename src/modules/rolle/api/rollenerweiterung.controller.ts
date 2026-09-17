import { Body, Controller, HttpCode, Param, Post, UseFilters } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOAuth2,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { uniq } from 'lodash-es';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { ApplyRollenerweiterungForAngebotService } from '../domain/apply-rollenerweiterungen-for-angebot-service.js';
import { MissingMerkmalVerfuegbarFuerRollenerweiterungError } from '../domain/missing-merkmal-verfuegbar-fuer-rollenerweiterung.error.js';
import { ApplyRollenerweiterungForSPPathParams } from './apply-rollenerweiterung-for-sp-changes.path.params.js';
import { ApplyRollenerweiterungMultiExceptionFilter } from './apply-rollenerweiterung-multi-exception-filter.js';
import { ApplyRollenerweiterungError } from './apply-rollenerweiterung.error.js';
import { ApplyRollenerweiterungBodyParams } from './apply-rollenerweiterung.body.params.js';
import { DbiamApplyRollenerweiterungMultiError } from './dbiam-apply-rollenerweiterung-multi.error.js';
import { RollenerweiterungExceptionFilter } from './rollenerweiterung-exception-filter.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';

@UseFilters(new RollenerweiterungExceptionFilter(), new ApplyRollenerweiterungMultiExceptionFilter())
@ApiTags('rolle')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'rollen-erweiterung' })
export class RollenerweiterungController {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly applyRollenerweiterungService: ApplyRollenerweiterungForAngebotService,
    ) {}

    @Post('/angebot/:angebotId/organisation/:organisationId/apply')
    @ApiOperation({ description: 'Apply changes to rollen-erweiterung for a given angebot and organisation.' })
    @ApiNoContentResponse({
        description: 'Changes applied successfully.',
    })
    @ApiNotFoundResponse({
        description: 'One or more of the specified objects were not found.',
        /* v8 ignore next */
        type: () => DbiamApplyRollenerweiterungMultiError,
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error',
        /* v8 ignore next */
        type: () => DbiamApplyRollenerweiterungMultiError,
    })
    @HttpCode(204)
    public async applyRollenerweiterungChanges(
        @Param() params: ApplyRollenerweiterungForSPPathParams,
        @Body() body: ApplyRollenerweiterungBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        this.logger.info(
            `applyRollenerweiterungChanges called by ${permissions.personFields.username} - ${permissions.personFields.id} for angebotId ${params.angebotId} and organisationId ${params.organisationId} with ${body.addErweiterungenForRolleIds.length} x ADD (${[...body.addErweiterungenForRolleIds].map((id: string) => id).join(', ')}) and ${body.removeErweiterungenForRolleIds.length} x REMOVE (${[...body.removeErweiterungenForRolleIds].map((id: string) => id).join(', ')}).`,
        );
        const angebotId: string = params.angebotId;
        const orgaId: string = params.organisationId;
        const result: Result<
            null,
            | ApplyRollenerweiterungError
            | EntityNotFoundError
            | MissingPermissionsError
            | MissingMerkmalVerfuegbarFuerRollenerweiterungError
        > = await this.applyRollenerweiterungService.applyRollenerweiterungChangesForAngebot(
            orgaId,
            angebotId,
            body,
            permissions,
        );
        if (!result.ok) {
            const err:
                | ApplyRollenerweiterungError
                | EntityNotFoundError
                | MissingPermissionsError
                | MissingMerkmalVerfuegbarFuerRollenerweiterungError = result.error;
            if (err instanceof ApplyRollenerweiterungError) {
                this.logger.error(
                    `applyRollenerweiterungChanges called by ${permissions.personFields.username} - ${permissions.personFields.id} for angebotId ${params.angebotId} and organisationId ${params.organisationId} completed with error for rollen: ${err.errors
                        .map((e: { id: string | undefined; error: DomainError }) => `${e.id} (${e.error.message})`)
                        .join(', ')}.
                    and success for rollen: ${uniq([
                        ...body.addErweiterungenForRolleIds,
                        ...body.removeErweiterungenForRolleIds,
                    ])
                        .filter(
                            (id: string) =>
                                !err.errors
                                    .map((e: { id: string | undefined; error: DomainError }) => e.id)
                                    .includes(id),
                        )
                        .join(', ')}.`,
                );
                throw result.error;
            } else {
                throw result.error;
            }
        }
        this.logger.info(
            `applyRollenerweiterungChanges called by ${permissions.personFields.username} - ${permissions.personFields.id} for angebotId ${params.angebotId} and organisationId ${params.organisationId} completed with complete success.`,
        );
    }
}
