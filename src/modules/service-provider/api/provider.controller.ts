import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    StreamableFile,
    UnauthorizedException,
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
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { uniq } from 'lodash-es';

import { ClassLogger } from '../../../core/logging/class-logger.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { DomainError, MissingPermissionsError } from '../../../shared/error/index.js';
import { ApiOkResponsePaginated, RawPagedResponse } from '../../../shared/paging/raw-paged.response.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/index.js';
import { StreamableFileFactory } from '../../../shared/util/streamable-file.factory.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PermittedOrgas, PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { RollenerweiterungWithExtendedDataResponse } from '../../rolle/api/rollenerweiterung-with-extended-data.response.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { Rollenerweiterung } from '../../rolle/domain/rollenerweiterung.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { AttachedRollenError } from '../domain/errors/attached-rollen.error.js';
import { AttachedRollenerweiterungenError } from '../domain/errors/attached-rollenerweiterungen.error.js';
import { InvalidLogoCombinationError } from '../domain/errors/invalid-logo-combination.error.js';
import { VidisServiceProviderImmutableError } from '../domain/errors/vidis-service-provider-immutable.error.js';
import { ServiceProviderFindService } from '../domain/service-provider-find.service.js';
import { ServiceProviderModificationService } from '../domain/service-provider-modification.service.js';
import { ServiceProviderSystem, ServiceProviderTarget } from '../domain/service-provider.enum.js';
import { ServiceProviderFactory } from '../domain/service-provider.factory.js';
import { ServiceProvider } from '../domain/service-provider.js';
import { ServiceProviderService } from '../domain/service-provider.service.js';
import {
    ManageableServiceProviderDetailsWithReferencedObjects,
    ManageableServiceProviderWithReferencedObjects,
    ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount,
} from '../domain/types.js';
import { ServiceProviderRepo } from '../repo/service-provider.repo.js';
import { AngebotByIdParams } from './angebot-by.id.params.js';
import { CreateServiceProviderBodyParams } from './create-service-provider-body.params.js';
import { CreateServiceProviderResponse } from './create-service-provider.response.js';
import { FindServiceProviderForRolleQueryParams } from './find-service-provider-for-rolle-query.params.js';
import { ManageableLandRootServiceProvidersQueryParams } from './manageable-land-root-service-providers-query.params.js';
import { ManageableServiceProviderListEntryResponse } from './manageable-service-provider-list-entry.response.js';
import { ManageableServiceProviderSimpleListEntryResponse } from './manageable-service-provider-simple-list-entry.response.js';
import { ManageableServiceProviderResponse } from './manageable-service-provider.response.js';
import { ManageableServiceProvidersForOrganisationParams } from './manageable-service-providers-for-organisation.params.js';
import { ManageableServiceProvidersParams } from './manageable-service-providers.params.js';
import { RollenerweiterungByServiceProvidersIdPathParams } from './rollenerweiterung-by-service-provider-id.pathparams.js';
import { RollenerweiterungByServiceProvidersIdQueryParams } from './rollenerweiterung-by-service-provider-id.queryparams.js';
import { ServiceProviderErrorFilter } from './service-provider-exception.filter.js';
import { ServiceProviderResponse } from './service-provider.response.js';
import { UpdateServiceProviderBodyParams } from './update-service-provider-body.params.js';

@UseFilters(ServiceProviderErrorFilter)
@ApiTags('provider')
@ApiOAuth2(['openid'])
@ApiBearerAuth()
@Controller({ path: 'provider' })
export class ProviderController {
    public constructor(
        private readonly streamableFileFactory: StreamableFileFactory,
        private readonly serviceProviderFactory: ServiceProviderFactory,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly serviceProviderFindService: ServiceProviderFindService,
        private readonly serviceProviderService: ServiceProviderService,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepo: OrganisationRepository,
        private readonly serviceProviderModificationService: ServiceProviderModificationService,
        private readonly logger: ClassLogger,
    ) {}

    @Get('assignable-for-rolle')
    @UseGuards(StepUpGuard)
    @ApiOperation({ description: 'Get all service-providers assignable for a role.' })
    @ApiOkResponse({
        description: 'The service-providers were successfully returned.',
        type: [ServiceProviderResponse],
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available service providers.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get service-providers.' })
    @ApiNotFoundResponse({ description: 'No service-providers found or lacking permissions.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all service-providers.' })
    public async getAssignableServiceProvidersForRolle(
        @Permissions() permissions: PersonPermissions,
        @Query() query: FindServiceProviderForRolleQueryParams,
    ): Promise<ServiceProviderResponse[]> {
        const result: Result<ServiceProvider<true>[], DomainError> =
            await this.serviceProviderFindService.findServiceProvidersForRolleBySchulstrukturknotenAuthorized(
                permissions,
                query.schulstrukturknotenOfRolle,
            );

        if (!result.ok) {
            throw result.error;
        }

        const response: ServiceProviderResponse[] = result.value.map(
            (serviceProvider: ServiceProvider<true>) => new ServiceProviderResponse(serviceProvider),
        );

        return response;
    }

    @Get()
    @ApiOperation({ description: 'Get service-providers available for logged-in user.' })
    @ApiOkResponse({
        description: 'The service-providers were successfully returned.',
        type: [ServiceProviderResponse],
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available service providers.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get service-providers.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all service-providers.' })
    public async getAvailableServiceProviders(
        @Permissions() permissions: PersonPermissions,
    ): Promise<ServiceProviderResponse[]> {
        const personenkontexteIds: Pick<Personenkontext<true>, 'organisationId' | 'rolleId'>[] =
            await permissions.getPersonenkontextIds();
        const serviceProviders: ServiceProvider<true>[] =
            await this.serviceProviderService.getServiceProvidersByOrganisationenAndRollen(personenkontexteIds);
        return serviceProviders.map(
            (serviceProvider: ServiceProvider<true>) => new ServiceProviderResponse(serviceProvider),
        );
    }

    @Get(':angebotId/logo')
    @ApiOkResponse({
        description: 'The logo for the service provider was successfully returned.',
        content: { 'image/*': { schema: { type: 'file', format: 'binary' } } },
    })
    @ApiBadRequestResponse({ description: 'Angebot ID is required.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get service provider logo.' })
    @ApiNotFoundResponse({ description: 'The service-provider does not exist or has no logo.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get the logo.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting the logo.' })
    public async getServiceProviderLogo(@Param() params: AngebotByIdParams): Promise<StreamableFile> {
        const serviceProvider: Option<ServiceProvider<true>> = await this.serviceProviderRepo.findById(
            params.angebotId,
            { withLogo: true },
        );

        if (!serviceProvider) {
            throw new EntityNotFoundError('ServiceProvider', params.angebotId);
        }

        if (!serviceProvider.logo || !serviceProvider.logoMimeType) {
            throw new EntityNotFoundError('ServiceProviderLogo', params.angebotId);
        }

        const logoFile: StreamableFile = this.streamableFileFactory.fromBuffer(serviceProvider.logo, {
            type: serviceProvider.logoMimeType,
        });

        return logoFile;
    }

    @Get(':angebotId/rollenerweiterung')
    @UseGuards(StepUpGuard)
    @ApiOperation({
        description:
            'Get rollenerweiterungen for service-provider with provided id. Total is the amount of organisations.',
    })
    @ApiOkResponsePaginated(RollenerweiterungWithExtendedDataResponse, {
        description:
            'The rollenerweiterungen were successfully returned. WARNING: This endpoint returns all rollenerweiterungen of the service-provider as default when no paging parameters were set.',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get rollenerweiterungen.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get rollenerweiterungen.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting rollenerweiterungen.' })
    public async findRollenerweiterungenByServiceProviderId(
        @Permissions() permissions: IPersonPermissions,
        @Param() pathParams: RollenerweiterungByServiceProvidersIdPathParams,
        @Query() queryParams: RollenerweiterungByServiceProvidersIdQueryParams,
    ): Promise<RawPagedResponse<RollenerweiterungWithExtendedDataResponse>> {
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.ROLLEN_ERWEITERN, RollenSystemRecht.ANGEBOTE_VERWALTEN],
            false,
            false,
        );
        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            throw new UnauthorizedException('NOT_AUTHORIZED');
        }

        if (
            queryParams.organisationIds &&
            !permittedOrgas.all &&
            !queryParams.organisationIds.every((id: string) => permittedOrgas.orgaIds.includes(id))
        ) {
            throw new MissingPermissionsError('Insufficient permissions for the requested organisationId');
        }

        let filteredOrgaIds: string[] | undefined = permittedOrgas.all ? undefined : permittedOrgas.orgaIds;
        if (queryParams.organisationIds?.length) {
            filteredOrgaIds = queryParams.organisationIds;
        }

        const [rollenerweiterungen, total]: Counted<Rollenerweiterung<true>> =
            await this.rollenerweiterungRepo.findByServiceProviderIdPagedAndSortedByOrgaKennung(
                pathParams.angebotId,
                filteredOrgaIds,
                queryParams.rolleIds,
                queryParams.offset,
                queryParams.limit,
            );

        const rolleIds: RolleID[] = uniq(rollenerweiterungen.map((re: Rollenerweiterung<true>) => re.rolleId));
        const organisationIds: OrganisationID[] = uniq(
            rollenerweiterungen.map((re: Rollenerweiterung<true>) => re.organisationId),
        );

        const [rollen, organisationen]: [Map<RolleID, Rolle<true>>, Map<OrganisationID, Organisation<true>>] =
            await Promise.all([this.rolleRepo.findByIds(rolleIds), this.organisationRepo.findByIds(organisationIds)]);

        /* The data is passed as option<> instead of mandatory with error checking,
        because otherwise a single faulty relation in an extension
        could cause all other extensions to fail to load */
        const rollenerweiterungResponses: RollenerweiterungWithExtendedDataResponse[] = rollenerweiterungen.map(
            (re: Rollenerweiterung<true>) =>
                new RollenerweiterungWithExtendedDataResponse(
                    re,
                    rollen.get(re.rolleId),
                    organisationen.get(re.organisationId),
                ),
        );

        return new RawPagedResponse({
            offset: queryParams.offset ?? 0,
            limit: queryParams.limit ?? total,
            total,
            items: rollenerweiterungResponses,
        });
    }

    @Get('manageable')
    @UseGuards(StepUpGuard)
    @ApiOperation({ description: 'Get service-providers the logged-in user is allowed to manage.' })
    @ApiOkResponsePaginated(ManageableServiceProviderSimpleListEntryResponse, {
        description:
            'The service providers were successfully returned. WARNING: This endpoint returns all service providers as default when no paging parameters were set.',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available service providers.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get service-providers.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all service-providers.' })
    public async getManageableServiceProviders(
        @Permissions() permissions: IPersonPermissions,
        @Query() params: ManageableServiceProvidersParams,
    ): Promise<RawPagedResponse<ManageableServiceProviderSimpleListEntryResponse>> {
        const [
            enrichedServiceProviders,
            total,
        ]: Counted<ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount> =
            await this.serviceProviderService.findAuthorized(permissions, {
                kategorien: params.kategorien,
                searchFilter: params.searchFilter,
                limit: params.limit,
                offset: params.offset,
            });

        return new RawPagedResponse({
            offset: params.offset ?? 0,
            limit: params.limit ?? total,
            total,
            items: enrichedServiceProviders.map(
                (
                    manageableServiceProviderWithReferencedObjects: ManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount,
                ) =>
                    ManageableServiceProviderSimpleListEntryResponse.fromManageableServiceProviderWithReferencedObjectsAndRollenerweiterungCount(
                        manageableServiceProviderWithReferencedObjects,
                    ),
            ),
        });
    }

    @Get('manageable-land-root')
    @UseGuards(StepUpGuard)
    @ApiOperation({
        description: 'Get service-providers provided at LAND or ROOT level. Requires root-level ANGEBOTE_VERWALTEN.',
    })
    @ApiOkResponsePaginated(ServiceProviderResponse, {
        description: 'The service providers were successfully returned.',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get service providers.' })
    @ApiNotFoundResponse({ description: 'Root-level ANGEBOTE_VERWALTEN permission required.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting service providers.' })
    public async getManageableLandRootServiceProviders(
        @Permissions() permissions: IPersonPermissions,
        @Query() params: ManageableLandRootServiceProvidersQueryParams,
    ): Promise<RawPagedResponse<ServiceProviderResponse>> {
        const result: Result<
            Counted<ServiceProvider<true>>,
            MissingPermissionsError
        > = await this.serviceProviderService.findManageableLandRoot(
            permissions,
            params.searchStr,
            params.limit,
            params.offset,
        );

        if (!result.ok) {
            throw result.error;
        }

        const [serviceProviders, total]: Counted<ServiceProvider<true>> = result.value;

        return new RawPagedResponse({
            offset: params.offset ?? 0,
            limit: params.limit ?? total,
            total,
            items: serviceProviders.map((sp: ServiceProvider<true>) => new ServiceProviderResponse(sp)),
        });
    }

    @Get('manageable-by-organisation')
    @UseGuards(StepUpGuard)
    @ApiOperation({ description: 'Get service-providers the logged-in user is allowed to manage for an Organisation.' })
    @ApiOkResponsePaginated(ManageableServiceProviderListEntryResponse, {
        description:
            'The service providers were successfully returned. WARNING: This endpoint returns all service providers as default when no paging parameters were set.',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available service providers.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get service-providers.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all service-providers.' })
    public async getManageableServiceProvidersForOrganisationId(
        @Permissions() permissions: IPersonPermissions,
        @Query() params: ManageableServiceProvidersForOrganisationParams,
    ): Promise<RawPagedResponse<ManageableServiceProviderListEntryResponse>> {
        const result: Result<
            Counted<ManageableServiceProviderWithReferencedObjects>,
            MissingPermissionsError
        > = await this.serviceProviderService.getAuthorizedForRollenErweiternWithMerkmalRollenerweiterung(
            params.organisationId,
            permissions,
            params.limit,
            params.offset,
        );

        if (!result.ok) {
            throw new MissingPermissionsError('Rollen Erweitern Systemrecht required for this endpoint');
        }

        const [serviceProvidersWithRollenAndErweiterungen, total]: [
            ManageableServiceProviderWithReferencedObjects[],
            number,
        ] = result.value;

        return new RawPagedResponse({
            offset: params.offset ?? 0,
            limit: params.limit ?? total,
            total,
            items: serviceProvidersWithRollenAndErweiterungen.map(
                (manageableServiceProviderWithReferencedObjects: ManageableServiceProviderWithReferencedObjects) =>
                    ManageableServiceProviderListEntryResponse.fromManageableServiceProviderWithReferencedObjects(
                        manageableServiceProviderWithReferencedObjects,
                    ),
            ),
        });
    }

    @Get('manageable/:angebotId')
    @UseGuards(StepUpGuard)
    @ApiOperation({ description: 'Get service-provider the logged-in user is allowed to manage.' })
    @ApiOkResponse({
        description: 'The service-provider was successfully returned.',
        type: ManageableServiceProviderResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get available service provider.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get service-provider.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting service-provider.' })
    public async getManageableServiceProviderById(
        @Permissions() permissions: IPersonPermissions,
        @Param() params: AngebotByIdParams,
    ): Promise<ManageableServiceProviderResponse> {
        const serviceProviderWithOrganisationRollenAndErweiterungen: Option<ManageableServiceProviderDetailsWithReferencedObjects> =
            await this.serviceProviderService.findManageableById(permissions, params.angebotId);

        if (!serviceProviderWithOrganisationRollenAndErweiterungen) {
            throw new EntityNotFoundError('ServiceProvider', params.angebotId);
        }

        return new ManageableServiceProviderResponse(
            serviceProviderWithOrganisationRollenAndErweiterungen.serviceProvider,
            serviceProviderWithOrganisationRollenAndErweiterungen.organisation,
            serviceProviderWithOrganisationRollenAndErweiterungen.rollen,
            serviceProviderWithOrganisationRollenAndErweiterungen.rollenerweiterungen.length > 0,
            serviceProviderWithOrganisationRollenAndErweiterungen.relevantSystemrechte,
        );
    }

    @Post()
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ description: 'Create a new service-provider (Angebot).' })
    @ApiCreatedResponse({
        description: 'The service-provider was successfully created.',
        type: CreateServiceProviderResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
    @ApiBadRequestResponse({ description: 'Invalid request body or VIDIS-linked service-provider.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
    public async createServiceProvider(
        @Permissions() permissions: IPersonPermissions,
        @Body() body: CreateServiceProviderBodyParams,
    ): Promise<CreateServiceProviderResponse> {
        // Convert base64 to Buffer (if provided)
        const logoBuffer: Buffer | undefined = body.logoBase64 ? Buffer.from(body.logoBase64, 'base64') : undefined;

        const serviceProvider: Result<
            ServiceProvider<false>,
            InvalidLogoCombinationError
        > = this.serviceProviderFactory.createNew(
            body.name,
            ServiceProviderTarget.URL,
            body.url,
            body.kategorie,
            body.organisationId,
            body.logoId,
            logoBuffer,
            body.logoMimeType,
            undefined, // keycloakGroup
            undefined, // keycloakRole
            ServiceProviderSystem.NONE,
            body.requires2fa,
            undefined, // vidisAngebotId
            body.merkmale,
            body.rollenartenWhitelist ?? [],
            undefined, // keycloakClient
        );
        if (!serviceProvider.ok) {
            throw serviceProvider.error;
        }

        const result: Result<ServiceProvider<true>, DomainError> = await this.serviceProviderModificationService.create(
            permissions,
            serviceProvider.value,
        );
        if (!result.ok) {
            throw result.error;
        }

        return new CreateServiceProviderResponse(result.value);
    }

    @Patch(':angebotId')
    @UseGuards(StepUpGuard)
    @ApiOperation({ description: 'Update a service-provider (Angebot).' })
    @ApiOkResponse({
        description: 'The service-provider was successfully updated.',
        type: ServiceProviderResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
    @ApiBadRequestResponse({ description: 'Invalid request body.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
    public async updateServiceProvider(
        @Permissions() permissions: PersonPermissions,
        @Param('angebotId') angebotId: ServiceProviderID,
        @Body() body: UpdateServiceProviderBodyParams,
    ): Promise<ServiceProviderResponse> {
        const existingServiceProvider: Option<ServiceProvider<true>> = await this.serviceProviderRepo.findById(
            angebotId,
            { withLogo: true },
        );
        if (!existingServiceProvider) {
            throw new EntityNotFoundError();
        }

        if (existingServiceProvider.vidisAngebotId) {
            throw new VidisServiceProviderImmutableError(
                'ServiceProvider linked to VIDIS cannot be updated or deleted',
                existingServiceProvider.id,
            );
        }

        const updateError: Option<InvalidLogoCombinationError> = existingServiceProvider.update(body);
        if (updateError) {
            throw updateError;
        }

        const result: Result<ServiceProvider<true>, DomainError> = await this.serviceProviderModificationService.update(
            permissions,
            existingServiceProvider,
        );

        if (!result.ok) {
            throw result.error;
        }

        this.logger.info(`ServiceProvider mit Id ${angebotId} erfolgreich aktualisiert.`);
        return new ServiceProviderResponse(result.value);
    }

    @Delete(':angebotId')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ description: 'Delete a service-provider (Angebot) by id.' })
    @ApiNoContentResponse({ description: 'The service-provider was successfully deleted.' })
    @ApiBadRequestResponse({ description: 'The service-provider is linked to VIDIS and cannot be deleted.' })
    @ApiConflictResponse({
        description: 'The service-provider has attached rollenerweiterungen or rollen and cannot be deleted.',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions.' })
    @ApiNotFoundResponse({ description: 'The service-provider does not exist.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
    public async deleteServiceProvider(
        @Permissions() permissions: PersonPermissions,
        @Param() params: AngebotByIdParams,
    ): Promise<void> {
        const result: Result<
            void,
            | EntityNotFoundError
            | MissingPermissionsError
            | AttachedRollenError
            | AttachedRollenerweiterungenError
            | VidisServiceProviderImmutableError
        > = await this.serviceProviderModificationService.deleteByIdAuthorized(permissions, params.angebotId);

        if (!result.ok) {
            throw result.error;
        }
        this.logger.info(
            `Admin ${permissions.personFields.username} (${permissions.personFields.id}) hat ServiceProvider mit Id ${params.angebotId} erfolgreich gelöscht.`,
        );
    }
}
