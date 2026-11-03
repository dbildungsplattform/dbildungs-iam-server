import { Body, Controller, Get, Put, UseFilters, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { MeldungResponse } from './meldung.response.js';
import { MeldungRepo } from '../persistence/meldung.repo.js';
import { Meldung } from '../domain/meldung.js';
import { CreateOrUpdateMeldungBodyParams } from './create-or-update-meldung.body.params.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { MeldungExceptionFilter } from './meldung.exception-filter.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';

@UseFilters(new MeldungExceptionFilter())
@ApiTags('meldung')
@ApiOAuth2(['openid'])
@ApiBearerAuth()
@Controller({ path: 'portal/meldung' })
export class MeldungController {
    public constructor(private readonly meldungRepo: MeldungRepo) {}

    @Get()
    @UseGuards(StepUpGuard)
    @ApiOperation({ description: 'Get all meldungen.' })
    @ApiOkResponse({
        description: 'The meldungen were successfully returned.',
        type: [MeldungResponse],
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available meldungen.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get meldungen.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all meldungen.' })
    public async getAllMeldungen(@Permissions() permissions: IPersonPermissions): Promise<MeldungResponse[]> {
        const requiredSytsmrechte: RollenSystemRecht[] = [
            RollenSystemRecht.SCHULPORTAL_VERWALTEN,
            RollenSystemRecht.HINWEISE_BEARBEITEN,
        ];
        const hasRequiredSystemrechte: boolean =
            await permissions.hasSystemrechteAtRootOrganisation(requiredSytsmrechte);
        if (!hasRequiredSystemrechte) {
            throw new MissingPermissionsError(
                'Schulportal Bearbeiten & Hinweise Bearbeiten Systemrecht Required For This Endpoint',
            );
        }

        const meldungen: Meldung<true>[] = await this.meldungRepo.findAll();
        const meldungenResponses: MeldungResponse[] = meldungen.map(
            (meldung: Meldung<true>) => new MeldungResponse(meldung),
        );
        return meldungenResponses;
    }

    @Get('current')
    @ApiOperation({ description: 'Get current veroeffentlicht meldung.' })
    @ApiOkResponse({
        description: 'The meldung was successfully returned.',
        type: MeldungResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get current veroeffentlicht meldunge.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get meldungen.' })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error while getting current veroeffentlicht meldung.',
    })
    public async getCurrentMeldung(): Promise<MeldungResponse | null> {
        const meldung: Option<Meldung<true>> = await this.meldungRepo.getRecentVeroeffentlichtMeldung();
        if (!meldung) {
            return null;
        }

        return new MeldungResponse(meldung);
    }

    //Kann keine ID in der URL haben, da die Anforderung ist, dass dieser Endpunkt auch Resourcen erstellen kann
    @Put()
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'The meldung was successfully edited.',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to modify the meldung.' })
    @ApiForbiddenResponse({ description: 'Not permitted to modify the meldung.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while modifying the meldung.' })
    public async createOrUpdateMeldung(
        @Body() body: CreateOrUpdateMeldungBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<MeldungResponse> {
        const requiredSystemrechte: RollenSystemRecht[] = [
            RollenSystemRecht.SCHULPORTAL_VERWALTEN,
            RollenSystemRecht.HINWEISE_BEARBEITEN,
        ];
        const hasRequiredSystemrechte: boolean =
            await permissions.hasSystemrechteAtRootOrganisation(requiredSystemrechte);
        if (!hasRequiredSystemrechte) {
            throw new MissingPermissionsError(
                'Schulportal Bearbeiten & Hinweise Bearbeiten Systemrecht Required For This Endpoint',
            );
        }

        if (this.isUpdateRequest(body)) {
            return this.handleUpdateMeldung(body);
        }
        return this.handleCreateMeldung(body);
    }

    //Private Helpers Below

    private async handleCreateMeldung(body: CreateOrUpdateMeldungBodyParams): Promise<MeldungResponse> {
        const createResult: Result<Meldung<false>, DomainError> = Meldung.createNew(body.inhalt, body.status);
        if (!createResult.ok) {
            throw createResult.error;
        }
        return new MeldungResponse(await this.meldungRepo.save(createResult.value));
    }

    private async handleUpdateMeldung<T extends { id: string }>(
        body: CreateOrUpdateMeldungBodyParams & T,
    ): Promise<MeldungResponse> {
        const existingMeldung: Option<Meldung<true>> = await this.meldungRepo.findById(body.id);
        if (!existingMeldung) {
            throw new EntityNotFoundError('Meldung', body.id);
        }
        const updateResult: Result<void, DomainError> = existingMeldung.update(body.revision, body.inhalt, body.status);
        if (!updateResult.ok) {
            throw updateResult.error;
        }
        return new MeldungResponse(await this.meldungRepo.save(existingMeldung));
    }

    private isUpdateRequest(
        body: CreateOrUpdateMeldungBodyParams,
    ): body is CreateOrUpdateMeldungBodyParams & { id: string } {
        return typeof body.id === 'string';
    }
}
