import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    NotFoundException,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UseFilters,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNoContentResponse,
    ApiNotFoundResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Paged, PagingHeadersObject } from '../../../shared/paging/index.js';
import { PagedResponse } from '../../../shared/paging/paged.response.js';
import { CreateOrganisationBodyParams } from './create-organisation.body.params.js';
import { FindOrganisationQueryParams } from './find-organisation-query.param.js';
import { OrganisationByIdParams } from './organisation-by-id.params.js';
import { UpdateOrganisationBodyParams } from './update-organisation.body.params.js';
import { OrganisationByIdBodyParams } from './organisation-by-id.body.params.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationResponse } from './organisation.response.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { OrganisationRootChildrenResponse } from './organisation.root-children.response.js';
import { DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { DbiamOrganisationError } from './dbiam-organisation.error.js';
import { OrganisationExceptionFilter } from './organisation-exception-filter.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { OrganisationByNameQueryParams } from './organisation-by-name.query.js';
import { ConfigService } from '@nestjs/config';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { OrganisationService } from '../domain/organisation.service.js';
import { DataConfig } from '../../../shared/config/data.config.js';
import { OrganisationByNameBodyParams } from './organisation-by-name.body.params.js';
import { OrganisationResponseLegacy } from './organisation.response.legacy.js';
import { ParentOrganisationsByIdsBodyParams } from './parent-organisations-by-ids.body.params.js';
import { ParentOrganisationenResponse } from './organisation.parents.response.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { OrganisationDeleteService } from '../organisation-delete/organisation-delete.service.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';

@UseFilters(new OrganisationExceptionFilter())
@ApiTags('organisationen')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'organisationen' })
export class OrganisationController {
    public constructor(
        private readonly organisationRepository: OrganisationRepository,
        private readonly config: ConfigService<ServerConfig>,
        private readonly organisationService: OrganisationService,
        private readonly organisationDeleteService: OrganisationDeleteService,
    ) {}

    @Post()
    @UseGuards(StepUpGuard)
    @ApiCreatedResponse({ description: 'The organisation was successfully created.', type: OrganisationResponse })
    @ApiBadRequestResponse({ description: 'The organisation already exists.', type: DbiamOrganisationError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to create the organisation.' })
    @ApiForbiddenResponse({ description: 'Not permitted to create the organisation.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while creating the organisation.' })
    public async createOrganisation(
        @Permissions() permissions: IPersonPermissions,
        @Body() params: CreateOrganisationBodyParams,
    ): Promise<OrganisationResponse> {
        const hasOrgVerwaltenRechtAtOrg: boolean = await permissions.hasOrgVerwaltenRechtAtOrga(
            params.typ,
            params.administriertVon,
        );

        if (!hasOrgVerwaltenRechtAtOrg) {
            throw new MissingPermissionsError('Not authorized to manage this organisation');
        }
        const organisation: Organisation<false> | DomainError = Organisation.createNew(
            params.administriertVon,
            params.zugehoerigZu,
            params.kennung,
            params.name,
            params.namensergaenzung,
            params.kuerzel,
            params.typ,
            params.traegerschaft,
            undefined,
            params.emailAdress,
        );
        if (organisation instanceof DomainError) {
            throw organisation;
        }
        const result: Result<Organisation<true>, DomainError> = await this.organisationService.createOrganisation(
            organisation,
            permissions,
        );
        if (!result.ok) {
            throw result.error;
        }

        return new OrganisationResponse(result.value);
    }

    @Put(':organisationId')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'The organisation was successfully updated.',
        type: OrganisationResponse,
    })
    @ApiBadRequestResponse({ description: 'Request has wrong format.', type: DbiamOrganisationError })
    @ApiUnauthorizedResponse({ description: 'Request is not authorized.' })
    @ApiNotFoundResponse({ description: 'The organisation was not found.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to perform operation.' })
    @ApiInternalServerErrorResponse({ description: 'An internal server error occurred.' })
    public async updateOrganisation(
        @Param() params: OrganisationByIdParams,
        @Body() body: UpdateOrganisationBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<OrganisationResponse> {
        const existingOrganisation: Option<Organisation<true>> = await this.organisationRepository.findById(
            params.organisationId,
        );

        if (!existingOrganisation) {
            throw new NotFoundException(`Organisation with ID ${params.organisationId} not found`);
        }

        const hasOrgVerwaltenRechtAtOrg: boolean = await permissions.hasOrgVerwaltenRechtAtOrga(
            body.typ,
            body.administriertVon,
        );

        if (!hasOrgVerwaltenRechtAtOrg) {
            throw new MissingPermissionsError('Not authorized to manage this organisation');
        }

        existingOrganisation.id = params.organisationId;
        existingOrganisation.administriertVon = body.administriertVon;
        existingOrganisation.zugehoerigZu = body.zugehoerigZu;
        existingOrganisation.kennung = body.kennung;
        existingOrganisation.name = body.name;
        existingOrganisation.namensergaenzung = body.namensergaenzung;
        existingOrganisation.kuerzel = body.kuerzel;
        existingOrganisation.typ = body.typ;
        existingOrganisation.traegerschaft = body.traegerschaft;
        existingOrganisation.emailAdress = body.emailAdress;
        existingOrganisation.updatedAt = new Date();

        const result: Result<Organisation<true>, DomainError> = await this.organisationService.updateOrganisation(
            existingOrganisation,
            permissions,
        );

        if (result.ok) {
            return new OrganisationResponse(result.value);
        } else {
            throw result.error;
        }
    }

    @Get('root')
    @ApiOkResponse({ description: 'The root organization was successfully retrieved.', type: OrganisationResponse })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get the root organization.' })
    @ApiNotFoundResponse({ description: 'The root organization does not exist.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get the root organization.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting the root organization.' })
    public async getRootOrganisation(): Promise<OrganisationResponse> {
        const ROOT_ORGANISATION_ID: string = this.config.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
        const result: Result<Organisation<true>, DomainError> = await this.organisationService.findOrganisationById(
            ROOT_ORGANISATION_ID,
        );

        if (result.ok) {
            return new OrganisationResponse(result.value);
        }

        throw result.error;
    }

    @Get('root/children')
    @ApiOkResponse({
        description: 'The root organizations were successfully pulled.',
        type: OrganisationRootChildrenResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get the organizations.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get the organizations.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting the organization.' })
    public async getRootChildren(): Promise<OrganisationRootChildrenResponse> {
        const [oeffentlich, ersatz]: [Organisation<true> | undefined, Organisation<true> | undefined] =
            await this.organisationRepository.findRootDirectChildren();

        if (!oeffentlich || !ersatz) {
            throw new EntityNotFoundError('Organisation', `${!oeffentlich && 'Oeffentlich'} ${!ersatz && 'Ersatz'}`);
        }

        return new OrganisationRootChildrenResponse(oeffentlich, ersatz);
    }

    @Post('parents-by-ids')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({
        description: 'The parent organizations were successfully pulled.',
        type: ParentOrganisationenResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get the organizations.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get the organizations.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting the organization.' })
    public async getParentsByIds(
        @Body() body: ParentOrganisationsByIdsBodyParams,
    ): Promise<ParentOrganisationenResponse> {
        const organisationen: Organisation<true>[] = await this.organisationRepository.findParentOrgasForIds(
            body.organisationIds,
        );
        return new ParentOrganisationenResponse(organisationen);
    }

    @Get(':organisationId')
    @ApiOkResponse({ description: 'The organization was successfully pulled.', type: OrganisationResponse })
    @ApiBadRequestResponse({ description: 'Organization ID is required' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get the organization.' })
    @ApiNotFoundResponse({ description: 'The organization does not exist.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get the organization.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting the organization.' })
    public async findOrganisationById(@Param() params: OrganisationByIdParams): Promise<OrganisationResponse> {
        const result: Result<Organisation<true>, DomainError> = await this.organisationService.findOrganisationById(
            params.organisationId,
        );

        if (result.ok) {
            return new OrganisationResponse(result.value);
        } else {
            throw result.error;
        }
    }

    @Get()
    @ApiOkResponse({
        description: 'The organizations were successfully returned.',
        type: [OrganisationResponse],
        headers: PagingHeadersObject,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get organizations.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get organizations.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all organizations.' })
    public async findOrganizations(
        @Query() queryParams: FindOrganisationQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PagedResponse<OrganisationResponse>> {
        const [organisations, total, pageTotal]: [Organisation<true>[], number, number] =
            await this.organisationRepository.findAuthorized(
                permissions,
                queryParams.systemrechte.map((value: RollenSystemRechtEnum) => RollenSystemRecht.getByName(value)),
                queryParams,
            );

        const organisationResponses: OrganisationResponse[] = organisations.map((organisation: Organisation<true>) => {
            return new OrganisationResponse(organisation);
        });

        const pagedOrganisationResponse: Paged<OrganisationResponse> = {
            offset: queryParams.offset ?? 0,
            limit: queryParams.limit ?? total,
            total: total,
            pageTotal: pageTotal,
            items: organisationResponses,
        };

        return new PagedResponse(pagedOrganisationResponse);
    }

    @Get(':organisationId/administriert')
    @ApiOkResponse({
        description: 'The organizations were successfully returned.',
        type: [OrganisationResponse],
        headers: PagingHeadersObject,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get organizations.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get organizations.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all organizations.' })
    public async getAdministrierteOrganisationen(
        @Param() routeParams: OrganisationByIdParams,
        @Query() queryParams: OrganisationByNameQueryParams,
    ): Promise<PagedResponse<OrganisationResponse>> {
        const parentOrg: Result<Organisation<true>, DomainError> = await this.organisationService.findOrganisationById(
            routeParams.organisationId,
        );
        if (!parentOrg.ok) {
            throw parentOrg.error;
        }

        const result: Paged<Organisation<true>> = await this.organisationService.findAllAdministriertVon(
            routeParams.organisationId,
            queryParams.searchFilter,
            queryParams.offset,
            queryParams.limit,
        );

        return new PagedResponse({
            total: result.total,
            offset: result.offset,
            limit: result.limit,
            items: result.items.map((item: Organisation<true>) => new OrganisationResponse(item)),
            pageTotal: result.items.length,
        });
    }

    // This endpoint will be added again in the future, but for now it is not needed and needs to be rewritten anyways
    // @Post(':organisationId/administriert')
    // public addAdministrierteOrganisation(): void

    @Get(':organisationId/zugehoerig')
    @ApiOkResponse({
        description: 'The organizations were successfully returned.',
        type: [OrganisationResponse],
        headers: PagingHeadersObject,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get organizations.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get organizations.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all organizations.' })
    public async getZugehoerigeOrganisationen(
        @Param() params: OrganisationByIdParams,
    ): Promise<PagedResponse<OrganisationResponse>> {
        const parentOrg: Result<Organisation<true>, DomainError> = await this.organisationService.findOrganisationById(
            params.organisationId,
        );
        if (!parentOrg.ok) {
            throw parentOrg.error;
        }

        const result: Paged<Organisation<true>> = await this.organisationService.findAllZugehoerigZu(
            params.organisationId,
        );

        const organisations: OrganisationResponse[] = result.items.map(
            (item: Organisation<true>) => new OrganisationResponse(item),
        );

        const response: PagedResponse<OrganisationResponse> = new PagedResponse({
            total: result.total,
            offset: result.offset,
            limit: result.limit,
            items: organisations,
            pageTotal: organisations.length,
        });

        return response;
    }

    @Post(':organisationId/zugehoerig')
    @UseGuards(StepUpGuard)
    @ApiParam({
        name: 'organisationId',
        description: 'The ID of the parent organisation to which another organisation will be added as a subordinate.',
        type: String,
    })
    @ApiBody({
        description: 'The ID of the child organisation that will be assigned to the parent organisation.',
        type: OrganisationByIdBodyParams,
    })
    @ApiCreatedResponse({ description: 'The organisation was successfully updated.' })
    @ApiBadRequestResponse({ description: 'The organisation could not be modified.', type: DbiamOrganisationError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to modify the organisation.' })
    @ApiForbiddenResponse({ description: 'Not permitted to modify the organisation.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while modifying the organisation.' })
    public async addZugehoerigeOrganisation(
        @Param() params: OrganisationByIdParams,
        @Body() body: OrganisationByIdBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const res: Result<void, DomainError> = await this.organisationService.setZugehoerigZu(
            params.organisationId,
            body.organisationId,
            permissions,
        );

        if (!res.ok) {
            throw res.error;
        }
    }

    @Patch(':organisationId/name')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'The organizations were successfully updated.',
        type: OrganisationResponseLegacy,
        headers: PagingHeadersObject,
    })
    @ApiBadRequestResponse({ description: 'The organisation could not be modified.', type: DbiamOrganisationError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to modify the organisation.' })
    @ApiForbiddenResponse({ description: 'Not permitted to modify the organisation.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while modifying the organisation.' })
    public async updateOrganisationName(
        @Param() params: OrganisationByIdParams,
        @Body() body: OrganisationByNameBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<OrganisationResponse | DomainError> {
        if (
            !(await permissions.hasSystemrechtAtOrganisation(
                params.organisationId,
                RollenSystemRecht.KLASSEN_VERWALTEN,
            ))
        ) {
            throw new MissingPermissionsError('Not authorized to manage this organisation');
        }

        const result: DomainError | Organisation<true> = await this.organisationRepository.updateOrganisationName(
            params.organisationId,
            body.name,
            body.version,
            permissions,
        );

        if (result instanceof DomainError) {
            throw result;
        }

        return new OrganisationResponse(result);
    }

    @Put(':organisationId/enable-for-its-learning')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'The organization was successfully enabled for itslearning.',
        type: OrganisationResponseLegacy,
        headers: PagingHeadersObject,
    })
    @ApiBadRequestResponse({ description: 'The organisation could not be modified.', type: DbiamOrganisationError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to modify the organisation.' })
    @ApiForbiddenResponse({ description: 'Not permitted to modify the organisation.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while modifying the organisation.' })
    public async enableForitslearning(
        @Param() params: OrganisationByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<OrganisationResponse | DomainError> {
        const result: DomainError | Organisation<true> = await this.organisationRepository.setEnabledForitslearning(
            permissions,
            params.organisationId,
        );

        if (result instanceof DomainError) {
            if (result instanceof OrganisationSpecificationError) {
                throw result;
            }

            throw result;
        }

        return new OrganisationResponse(result);
    }

    @Delete(':organisationId')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ description: 'Delete an organisation by id.' })
    @ApiNoContentResponse({ description: 'The organisation was deleted successfully.' })
    @ApiBadRequestResponse({ description: 'The input was not valid.', type: DbiamOrganisationError })
    @ApiNotFoundResponse({ description: 'The organisation that should be deleted does not exist.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to delete the organisation.' })
    public async deleteOrganisation(
        @Param() params: OrganisationByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const organisation: Result<
            Organisation<true>,
            EntityNotFoundError | MissingPermissionsError
        > = await this.organisationService.findOrganisationByIdAndAnyMatchingPermissions(
            permissions,
            params.organisationId,
        );
        if (!organisation.ok) {
            throw organisation.error;
        }

        const result: DomainError | void = await this.organisationDeleteService.deleteOrganisation(
            params.organisationId,
        );
        if (result instanceof DomainError) {
            throw result;
        }
    }
}
