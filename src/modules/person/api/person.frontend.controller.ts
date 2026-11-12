import { Controller, Get, Query, UnauthorizedException } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiOAuth2,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiOkResponsePaginated, DisablePagingInterceptor, PagedResponse } from '../../../shared/paging/index.js';
import { PersonenQueryParams } from './personen-query.param.js';
import { Person } from '../domain/person.js';
import { PersonendatensatzResponse } from './personendatensatz.response.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { ConfigService } from '@nestjs/config';
import { DataConfig } from '../../../shared/config/data.config.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';

@ApiTags('personen-frontend')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'personen-frontend' })
export class PersonFrontendController {
    public readonly ROOT_ORGANISATION_ID: string;

    public constructor(
        private readonly personRepository: PersonRepository,
        config: ConfigService<ServerConfig>,
    ) {
        this.ROOT_ORGANISATION_ID = config.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
    }

    @Get()
    @DisablePagingInterceptor()
    @ApiOkResponsePaginated(PersonendatensatzResponse, {
        description:
            'The persons were successfully returned. WARNING: This endpoint returns all persons as default when no paging parameters were set.',
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get persons.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get persons.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all persons.' })
    public async findPersons(
        @Query() queryParams: PersonenQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PagedResponse<PersonendatensatzResponse>> {
        // Find all organisations where user has permission
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.PERSONEN_VERWALTEN],
            true,
        );

        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            throw new UnauthorizedException('NOT_AUTHORIZED');
        }

        const [persons, total]: Counted<Person<true>> = await this.personRepository.findbyPersonFrontend(
            queryParams,
            permittedOrgas,
        );

        const response: PagedResponse<PersonendatensatzResponse> = new PagedResponse({
            offset: queryParams.offset ?? 0,
            limit: queryParams.limit ?? total,
            total: total,
            items: persons.map((person: Person<true>) => new PersonendatensatzResponse(person, false)),
        });

        return response;
    }
}
