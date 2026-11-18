import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiTags,
    ApiUnauthorizedResponse,
    getSchemaPath,
} from '@nestjs/swagger';
import { DBiamPersonenuebersichtResponse } from './dbiam-personenuebersicht.response.js';
import { DBiamFindPersonenuebersichtByPersonIdParams } from './dbiam-find-personenuebersicht-by-personid.params.js';
import { Person } from '../../domain/person.js';
import { PersonRepository } from '../../persistence/person.repository.js';
import { EntityNotFoundError } from '../../../../shared/error/entity-not-found.error.js';
import { DBiamPersonenzuordnungResponse } from './dbiam-personenzuordnung.response.js';
import { Personenkontext } from '../../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleRepo } from '../../../rolle/repo/rolle.repo.js';
import { OrganisationID, PersonID, RolleID } from '../../../../shared/types/aggregate-ids.types.js';
import { Rolle } from '../../../rolle/domain/rolle.js';
import { PersonenuebersichtBodyParams } from './personenuebersicht-body.params.js';
import { Permissions } from '../../../authentication/api/permissions.decorator.js';
import { ConfigService } from '@nestjs/config';
import { ServerConfig, DataConfig } from '../../../../shared/config/index.js';
import { DbiamPersonenuebersicht } from '../../domain/dbiam-personenuebersicht.js';
import { OrganisationRepository } from '../../../organisation/persistence/organisation.repository.js';
import { Organisation } from '../../../organisation/domain/organisation.js';
import { IPersonPermissions } from '../../../../shared/permissions/person-permissions.interface.js';

@ApiTags('dbiam-personenuebersicht')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'dbiam/personenuebersicht' })
export class DBiamPersonenuebersichtController {
    public readonly ROOT_ORGANISATION_ID: string;

    public constructor(
        private readonly personRepository: PersonRepository,
        private readonly dbiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly rolleRepository: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
        private config: ConfigService<ServerConfig>,
    ) {
        this.ROOT_ORGANISATION_ID = config.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
    }

    @Post('')
    @Post('')
    @ApiOkResponse({
        description: 'The personenuebersichten were successfully returned.',
        schema: {
            type: 'object',
            required: ['items'],
            properties: {
                items: {
                    type: 'array',
                    items: {
                        $ref: getSchemaPath(DBiamPersonenuebersichtResponse),
                    },
                },
            },
        },
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get personenuebersichten.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to get personenuebersichten.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting personenuebersichten.' })
    public async findPersonenuebersichten(
        @Body() bodyParams: PersonenuebersichtBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<{ items: DBiamPersonenuebersichtResponse[] }> {
        const persons: Person<true>[] = await this.personRepository.findByIds(bodyParams.personIds, permissions);

        const items: DBiamPersonenuebersichtResponse[] = [];
        if (persons.length > 0) {
            const allPersonIds: PersonID[] = persons.map((person: Person<true>) => person.id);
            const allPersonenKontexte: Map<PersonID, Personenkontext<true>[]> =
                await this.dbiamPersonenkontextRepo.findByPersonIds(allPersonIds);

            const allRollenIds: Set<RolleID> = new Set(
                Array.from(allPersonenKontexte.values()).flatMap((kontexte: Personenkontext<true>[]) =>
                    kontexte.map((kontext: Personenkontext<true>) => kontext.rolleId),
                ),
            );
            const allOrganisationIds: Set<OrganisationID> = new Set(
                Array.from(allPersonenKontexte.values()).flatMap((kontexte: Personenkontext<true>[]) =>
                    kontexte.map((kontext: Personenkontext<true>) => kontext.organisationId),
                ),
            );
            const allRollen: Map<string, Rolle<true>> = await this.rolleRepository.findByIds(Array.from(allRollenIds));
            const allOrganisations: Map<string, Organisation<true>> = await this.organisationRepository.findByIds(
                Array.from(allOrganisationIds),
            );
            const dbiamPersonenUebersicht: DbiamPersonenuebersicht = DbiamPersonenuebersicht.createNew(
                this.personRepository,
                this.dbiamPersonenkontextRepo,
                this.organisationRepository,
                this.rolleRepository,
                this.config,
            );

            await Promise.all(
                persons.map(async (person: Person<true>) => {
                    const personenKontexte: Personenkontext<true>[] = allPersonenKontexte.get(person.id) ?? [];
                    const personenUebersichtenResult: [DBiamPersonenzuordnungResponse[], Date?] | EntityNotFoundError =
                        await dbiamPersonenUebersicht.createZuordnungenForKontexte(
                            personenKontexte,
                            allRollen,
                            allOrganisations,
                        );

                    if (personenUebersichtenResult instanceof EntityNotFoundError) {
                        throw personenUebersichtenResult;
                    }
                    items.push(
                        new DBiamPersonenuebersichtResponse(
                            person,
                            personenUebersichtenResult[0],
                            personenUebersichtenResult[1],
                        ),
                    );
                }),
            );
        }

        return {
            items,
        };
    }

    @Get(':personId')
    @ApiOkResponse({
        description: 'The personenuebersichten were successfully returned.',
        type: DBiamPersonenuebersichtResponse,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get personenuebersicht.' })
    @ApiForbiddenResponse({ description: 'Insufficient permission to get personenuebersicht.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting personenuebersicht.' })
    public async findPersonenuebersichtenByPerson(
        @Param() params: DBiamFindPersonenuebersichtByPersonIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<DBiamPersonenuebersichtResponse> {
        const dbiamPersonenUebersicht: DbiamPersonenuebersicht = DbiamPersonenuebersicht.createNew(
            this.personRepository,
            this.dbiamPersonenkontextRepo,
            this.organisationRepository,
            this.rolleRepository,
            this.config,
        );
        const responseOrError: Result<DBiamPersonenuebersichtResponse, EntityNotFoundError> =
            await dbiamPersonenUebersicht.getPersonenkontexte(params.personId, permissions);

        if (!responseOrError.ok) {
            throw responseOrError.error;
        }

        return responseOrError.value;
    }
}
