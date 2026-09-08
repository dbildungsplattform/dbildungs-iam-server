import {
    Body,
    Controller,
    Delete,
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
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/index.js';
import { Paged, PagedResponse, PagingHeadersObject } from '../../../shared/paging/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { Public } from '../../authentication/api/public.decorator.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { RolleFindService } from '../domain/rolle-find.service.js';
import { RolleHatPersonenkontexteError } from '../domain/rolle-hat-personenkontexte.error.js';
import { RolleFactory } from '../domain/rolle.factory.js';
import { Rolle } from '../domain/rolle.js';
import { RollenerweiterungFactory } from '../domain/rollenerweiterung.factory.js';
import { Rollenerweiterung } from '../domain/rollenerweiterung.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../domain/systemrecht.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../repo/rollenerweiterung.repo.js';
import { CreateRolleBodyParams } from './create-rolle.body.params.js';
import { CreateRollenerweiterungBodyParams } from './create-rollenerweiterung.body.params.js';
import { DbiamRolleError } from './dbiam-rolle.error.js';
import { FindRolleByIdParams } from './find-rolle-by-id.params.js';
import { FindRollenQueryParams } from './find-rollen-query.params.js';
import { RolleExceptionFilter } from './rolle-exception-filter.js';
import { RolleServiceProviderResponse } from './rolle-service-provider.response.js';
import { RolleWithServiceProvidersResponse } from './rolle-with-serviceprovider.response.js';
import { RollenerweiterungResponse } from './rollenerweiterung.response.js';
import { SystemRechtResponse } from './systemrecht.response.js';
import { UpdateRolleBodyParams } from './update-rolle.body.params.js';

@UseFilters(new RolleExceptionFilter())
@ApiTags('rolle')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'rolle' })
export class RolleController {
    public constructor(
        private readonly rolleRepo: RolleRepo,
        private readonly rolleFactory: RolleFactory,
        private readonly rolleFindService: RolleFindService,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly organisationRepository: OrganisationRepository,
        private readonly logger: ClassLogger,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
        private readonly rollenerweiterungFactory: RollenerweiterungFactory,
    ) {}

    @Get()
    @ApiOperation({ description: 'List all rollen.' })
    @ApiOkResponse({
        description: 'The rollen were successfully returned',
        type: [RolleWithServiceProvidersResponse],
        headers: PagingHeadersObject,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get rollen.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get rollen.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all rollen.' })
    public async findRollen(
        @Query() queryParams: FindRollenQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PagedResponse<RolleWithServiceProvidersResponse>> {
        let rollenAndTotal: [Rolle<true>[], number];
        if (
            queryParams.systemrechte &&
            queryParams.systemrechte.length === 1 &&
            queryParams.systemrechte[0] === RollenSystemRechtEnum.ROLLEN_ERWEITERN
        ) {
            rollenAndTotal = await this.rolleFindService.findRollenAvailableForErweiterung({
                permissions,
                searchStr: queryParams.searchStr,
                organisationIds: queryParams.organisationContextForOperation
                    ? [queryParams.organisationContextForOperation]
                    : undefined,
                rollenArten: queryParams.rollenarten,
                limit: queryParams.limit,
                offset: queryParams.offset,
            });
        } else if (
            queryParams.systemrechte &&
            queryParams.systemrechte.length === 1 &&
            queryParams.systemrechte[0] === RollenSystemRechtEnum.IMPORT_DURCHFUEHREN
        ) {
            rollenAndTotal = await this.rolleFindService.findRollenAvailableForImportPersonenkontext({
                permissions,
                searchStr: queryParams.searchStr,
                organisationIds: queryParams.organisationContextForOperation
                    ? [queryParams.organisationContextForOperation]
                    : undefined,
                rollenArten: queryParams.rollenarten,
                limit: queryParams.limit,
                offset: queryParams.offset,
            });
        } else {
            rollenAndTotal = await this.rolleRepo.findRollenAuthorized(
                permissions,
                queryParams.systemrechte?.map((value: RollenSystemRechtEnum) => RollenSystemRecht.getByName(value)),
                false,
                queryParams.searchStr,
                queryParams.limit,
                queryParams.offset,
                queryParams.organisationenForFilter,
                queryParams.rolleIds,
                queryParams.merkmale,
                queryParams.rollenarten,
                queryParams.serviceProviderIds,
            );
        }

        const [rollen, total]: [Rolle<true>[], number] = rollenAndTotal;
        if (!rollen || rollen.length === 0) {
            const pagedRolleWithServiceProvidersResponse: Paged<RolleWithServiceProvidersResponse> = {
                total: 0,
                offset: 0,
                limit: queryParams.limit ?? 0,
                items: [],
            };
            return new PagedResponse(pagedRolleWithServiceProvidersResponse);
        }

        const administeredBySchulstrukturknotenIds: string[] = rollen.map(
            (r: Rolle<true>) => r.administeredBySchulstrukturknoten,
        );
        const administeredOrganisations: Map<string, Organisation<true>> = await this.organisationRepository.findByIds(
            administeredBySchulstrukturknotenIds,
        );
        const serviceProviders: ServiceProvider<true>[] = await this.serviceProviderRepo.find();
        const rollenWithServiceProvidersResponses: RolleWithServiceProvidersResponse[] = rollen.map(
            (r: Rolle<true>) => {
                const sps: ServiceProvider<true>[] = r.serviceProviderIds
                    .map((id: string) => serviceProviders.find((sp: ServiceProvider<true>) => sp.id === id))
                    .filter(Boolean);

                const administeredBySchulstrukturknoten: Organisation<true> | undefined = administeredOrganisations.get(
                    r.administeredBySchulstrukturknoten,
                );

                return new RolleWithServiceProvidersResponse(
                    r,
                    sps,
                    administeredBySchulstrukturknoten?.name,
                    administeredBySchulstrukturknoten?.kennung,
                );
            },
        );
        const pagedRolleWithServiceProvidersResponse: Paged<RolleWithServiceProvidersResponse> = {
            total: total,
            offset: queryParams.offset ?? 0,
            limit: queryParams.limit ?? rollenWithServiceProvidersResponses.length,
            items: rollenWithServiceProvidersResponses,
        };

        return new PagedResponse(pagedRolleWithServiceProvidersResponse);
    }

    @Get('systemrechte')
    @ApiOperation({ description: 'Get all systemrechte for rollen.' })
    @Public()
    @ApiOkResponse({
        description: 'Returns all systemrechte for rollen.',
        type: [SystemRechtResponse],
    })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error',
    })
    public getAllSystemrechte(): SystemRechtResponse[] {
        return RollenSystemRecht.ALL.map((systemRecht: RollenSystemRecht) => new SystemRechtResponse(systemRecht));
    }

    @Get(':rolleId')
    @ApiOperation({ description: 'Get rolle by id.' })
    @ApiOkResponse({
        description: 'The rolle was successfully returned.',
        type: RolleWithServiceProvidersResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get rolle by id.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to get rolle by id.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting rolle by id.' })
    public async findRolleByIdWithServiceProviders(
        @Param() findRolleByIdParams: FindRolleByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<RolleWithServiceProvidersResponse> {
        const rolleResult: Result<Rolle<true>> = await this.rolleRepo.findByIdAuthorized(
            findRolleByIdParams.rolleId,
            permissions,
        );
        if (!rolleResult.ok) {
            throw new EntityNotFoundError('Rolle', findRolleByIdParams.rolleId);
        }

        return this.returnRolleWithServiceProvidersResponse(rolleResult.value);
    }

    @Post()
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ description: 'Create a new rolle.' })
    @ApiCreatedResponse({ description: 'The rolle was successfully created.', type: RolleWithServiceProvidersResponse })
    @ApiBadRequestResponse({ description: 'The input was not valid.', type: DbiamRolleError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to create the rolle.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to create the rolle.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while creating the rolle.' })
    public async createRolle(
        @Body() params: CreateRolleBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<RolleWithServiceProvidersResponse> {
        const rolle: DomainError | Rolle<false> = this.rolleFactory.createNew(
            params.name,
            params.administeredBySchulstrukturknoten,
            params.rollenart,
            params.merkmale,
            params.systemrechte.map((s: RollenSystemRechtEnum) => RollenSystemRecht.getByName(s)),
            params.serviceProviderIds,
            [],
            false,
        );

        if (rolle instanceof DomainError) {
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht eine neue Rolle ${params.name} anzulegen. Fehler: ${rolle.message}`,
            );
            throw rolle;
        }

        const result: Result<Rolle<true>, DomainError> = await this.rolleRepo.createRolleAuthorized(rolle, permissions);
        if (!result.ok) {
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht eine neue Rolle ${params.name} anzulegen. Fehler: ${result.error.message}.`,
            );
            throw result.error;
        }

        this.logger.info(`Admin: ${permissions.personFields.id}) hat eine neue Rolle angelegt: ${result.value.name}.`);

        return new RolleWithServiceProvidersResponse(result.value, result.value.serviceProviderData);
    }

    @Get(':rolleId/serviceProviders')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ description: 'Get service-providers for a rolle by its id.' })
    @ApiOkResponse({ description: 'Returns a list of service-provider ids.', type: RolleServiceProviderResponse })
    @ApiNotFoundResponse({ description: 'The rolle does not exist.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to retrieve service-providers for rolle.' })
    public async getRolleServiceProviderIds(
        @Param() findRolleByIdParams: FindRolleByIdParams,
    ): Promise<RolleServiceProviderResponse> {
        const rolle: Option<Rolle<true>> = await this.rolleRepo.findById(findRolleByIdParams.rolleId);
        if (!rolle) {
            throw new EntityNotFoundError();
        }
        return new RolleServiceProviderResponse(rolle.serviceProviderIds);
    }

    @Put(':rolleId')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ description: 'Update rolle.' })
    @ApiOkResponse({
        description: 'The rolle was successfully updated.',
        type: RolleWithServiceProvidersResponse,
    })
    @ApiBadRequestResponse({ description: 'The input was not valid.', type: DbiamRolleError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to update the rolle.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to update the rolle.' })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error while updating the rolle.',
    })
    public async updateRolle(
        @Param() findRolleByIdParams: FindRolleByIdParams,
        @Body() params: UpdateRolleBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<RolleWithServiceProvidersResponse> {
        const rolle: Option<Rolle<true>> = await this.rolleRepo.findById(findRolleByIdParams.rolleId);
        const rolleName: string = rolle?.name ?? 'ROLLE_NOT_FOUND';

        const isAlreadyAssigned: boolean = await this.dBiamPersonenkontextRepo.isRolleAlreadyAssigned(
            findRolleByIdParams.rolleId,
        );
        const result: Result<Rolle<true>, DomainError> = await this.rolleRepo.updateRolleAuthorized(
            findRolleByIdParams.rolleId,
            params.name,
            params.merkmale,
            params.systemrechte.map((s: RollenSystemRechtEnum) => RollenSystemRecht.getByName(s)),
            params.serviceProviderIds,
            params.version,
            isAlreadyAssigned,
            permissions,
        );

        if (!result.ok) {
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht eine Rolle ${params.name} zu bearbeiten. Fehler: ${result.error.message}`,
            );

            throw result.error;
        }

        this.logger.info(`Admin: ${permissions.personFields.id}) hat eine Rolle bearbeitet: ${rolleName}.`);

        return this.returnRolleWithServiceProvidersResponse(result.value);
    }

    @Delete(':rolleId')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ description: 'Delete a role by id.' })
    @ApiNoContentResponse({ description: 'Role was deleted successfully.' })
    @ApiBadRequestResponse({ description: 'The input was not valid.', type: DbiamRolleError })
    @ApiNotFoundResponse({ description: 'The rolle that should be deleted does not exist.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to delete the role.' })
    public async deleteRolle(
        @Param() findRolleByIdParams: FindRolleByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const rolle: Option<Rolle<true>> = await this.rolleRepo.findById(findRolleByIdParams.rolleId);
        if (!rolle) {
            const error: DomainError = new EntityNotFoundError('Rolle', findRolleByIdParams.rolleId);
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht eine Rolle mit der ID ${findRolleByIdParams.rolleId} zu entfernen. Fehler: ${error.message}`,
            );
            throw error;
        }
        const rolleName: string = rolle.name;

        const result: Option<RolleHatPersonenkontexteError | EntityNotFoundError | MissingPermissionsError> =
            await this.rolleRepo.deleteAuthorized(findRolleByIdParams.rolleId, permissions);
        if (result instanceof DomainError) {
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht die Rolle ${rolleName} zu entfernen. Fehler: ${result.message}`,
            );
            throw result;
        }

        this.logger.info(`Admin: ${permissions.personFields.id}) hat eine Rolle entfernt: ${rolleName}.`);
    }

    @Post('erweiterung')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ description: 'Create a new rollenerweiterung.' })
    @ApiCreatedResponse({
        description: 'The rollenerweiterung was successfully created.',
        type: RollenerweiterungResponse,
    })
    @ApiBadRequestResponse({ description: 'The input was not valid.', type: DbiamRolleError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to create the rollenerweiterung.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to create the rollenerweiterung.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while creating the rollenerweiterung.' })
    public async createRollenerweiterung(
        @Body() params: CreateRollenerweiterungBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<RollenerweiterungResponse> {
        const rollenerweiterung: Rollenerweiterung<false> = this.rollenerweiterungFactory.createNew(
            params.organisationId,
            params.rolleId,
            params.serviceProviderId,
        );

        const result: Result<Rollenerweiterung<true>, DomainError> = await this.rollenerweiterungRepo.createAuthorized(
            rollenerweiterung,
            permissions,
        );
        if (!result.ok) {
            this.logger.error(
                `Admin: ${permissions.personFields.id}) hat versucht eine Rolle ${params.rolleId} zu erweitern. Fehler: ${result.error.message}.`,
            );
            throw result.error;
        }
        this.logger.info(
            `Admin: ${permissions.personFields.id}) hat eine Rolle erweitert. organisationId: ${result.value.organisationId} rolleId: ${result.value.rolleId} serviceProviderId: ${result.value.serviceProviderId}.`,
        );

        return new RollenerweiterungResponse(result.value);
    }

    private async returnRolleWithServiceProvidersResponse(
        rolle: Rolle<true>,
    ): Promise<RolleWithServiceProvidersResponse> {
        const serviceProviders: ServiceProvider<true>[] = await this.serviceProviderRepo.find();

        const rolleServiceProviders: ServiceProvider<true>[] = rolle.serviceProviderIds
            .map((id: string) => serviceProviders.find((sp: ServiceProvider<true>) => sp.id === id))
            .filter(Boolean);

        return new RolleWithServiceProvidersResponse(rolle, rolleServiceProviders);
    }
}
