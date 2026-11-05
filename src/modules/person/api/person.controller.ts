import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    NotImplementedException,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UnauthorizedException,
    UseFilters,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    ApiAcceptedResponse,
    ApiBadGatewayResponse,
    ApiBadRequestResponse,
    ApiBearerAuth,
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
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { LdapAdapter } from '../../../core/ldap/adapter/domain/ldap.adapter.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DataConfig, ServerConfig } from '../../../shared/config/index.js';
import { DomainError, EntityNotFoundError } from '../../../shared/error/index.js';
import { KafkaPersonExternalSystemsSyncEvent } from '../../../shared/events/kafka-person-external-systems-sync.event.js';
import { KafkaPersonLdapSyncEvent } from '../../../shared/events/kafka-person-ldap-sync.event.js';
import { PersonExternalSystemsSyncEvent } from '../../../shared/events/person-external-systems-sync.event.js';
import { PersonLdapSyncEvent } from '../../../shared/events/person-ldap-sync.event.js';
import { ApiOkResponsePaginated, Paged, PagedResponse, PagingHeadersObject } from '../../../shared/paging/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { ResultInterceptor } from '../../../shared/util/result-interceptor.js';
import { Permissions } from '../../authentication/api/permissions.decorator.js';
import { StepUpGuard } from '../../authentication/api/steup-up.guard.js';
import { PermittedOrgas, PersonFields } from '../../authentication/domain/person-permissions.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { UserLock } from '../../keycloak-administration/domain/user-lock.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { PersonenkontextQueryParams } from '../../personenkontext/api/param/personenkontext-query.params.js';
import { PersonenkontextResponse } from '../../personenkontext/api/response/personenkontext.response.js';
import { DBiamPersonenkontextService } from '../../personenkontext/domain/dbiam-personenkontext.service.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { PersonenkontextService } from '../../personenkontext/domain/personenkontext.service.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { PersonDomainError } from '../domain/person-domain.error.js';
import { DownstreamKeycloakError } from '../domain/person-keycloak.error.js';
import { NotFoundOrNoPermissionError } from '../domain/person-not-found-or-no-permission.error.js';
import { PersonUserPasswordModificationError } from '../domain/person-user-password-modification.error.js';
import { PersonLockOccasion } from '../domain/person.enums.js';
import { Person } from '../domain/person.js';
import { PersonApiMapper } from '../mapper/person-api.mapper.js';
import { PersonRepository } from '../persistence/person.repository.js';
import { PersonDeleteService } from '../person-deletion/person-delete.service.js';
import { PersonLandesbediensteterSearchService } from '../person-landesbedienstete-search/person-landesbediensteter-search.service.js';
import { DbiamPersonError } from './dbiam-person.error.js';
import { LockUserBodyParams } from './lock-user.body.params.js';
import { PersonByIdParams } from './person-by-id.param.js';
import { PersonEmailResponse } from './person-email-response.js';
import { PersonExceptionFilter } from './person-exception-filter.js';
import { PersonLandesbediensteterSearchQueryParams } from './person-landesbediensteter-search-query.param.js';
import { PersonLandesbediensteterSearchResponse } from './person-landesbediensteter-search.response.js';
import { PersonLockResponse } from './person-lock.response.js';
import { PersonMetadataBodyParams } from './person-metadata.body.param.js';
import { PersonendatensatzResponse } from './personendatensatz.response.js';
import { UpdatePersonBodyParams } from './update-person.body.params.js';

@UseFilters(new PersonExceptionFilter())
@ApiTags('personen')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller({ path: 'personen' })
export class PersonController {
    public readonly ROOT_ORGANISATION_ID: string;

    public constructor(
        private readonly personRepository: PersonRepository,
        private readonly emailResolverService: EmailResolverService,
        private readonly personenkontextService: PersonenkontextService,
        private readonly personDeleteService: PersonDeleteService,
        private readonly personLandesbediensteterSearchService: PersonLandesbediensteterSearchService,
        private readonly logger: ClassLogger,
        private keycloakUserService: KeycloakUserService,
        private readonly dBiamPersonenkontextService: DBiamPersonenkontextService,
        private readonly ldapClientAdapter: LdapAdapter,
        private readonly personApiMapper: PersonApiMapper,
        private readonly eventService: EventRoutingLegacyKafkaService,
        config: ConfigService<ServerConfig>,
    ) {
        this.ROOT_ORGANISATION_ID = config.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
    }

    @Get('landesbediensteter')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'The landesbediensteter was successfully returned.',
        type: [PersonLandesbediensteterSearchResponse],
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get landesbedienstete.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get landesbedienstete.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting landesbedienstete.' })
    public async findLandesbediensteter(
        @Query() queryParams: PersonLandesbediensteterSearchQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonLandesbediensteterSearchResponse[]> {
        // Find all organisations where user has permission
        const permittedOrgas: PermittedOrgas = await permissions.getOrgIdsWithSystemrecht(
            [RollenSystemRecht.LANDESBEDIENSTETE_SUCHEN_UND_HINZUFUEGEN],
            true,
            false,
        );
        if (!permittedOrgas.all && permittedOrgas.orgaIds.length === 0) {
            throw new UnauthorizedException('NOT_AUTHORIZED');
        }
        return this.personLandesbediensteterSearchService.findLandesbediensteter(
            queryParams.personalnummer,
            queryParams.primaryEmailAddress,
            queryParams.username,
            queryParams.vorname,
            queryParams.familienname,
        );
    }

    @Delete(':personId')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiNoContentResponse({
        description: 'The person and all their kontexte were successfully deleted.',
    })
    @ApiBadRequestResponse({ description: 'Request has wrong format.' })
    @ApiUnauthorizedResponse({ description: 'Request is not authorized.' })
    @ApiNotFoundResponse({ description: 'The person was not found.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to perform operation.' })
    @ApiInternalServerErrorResponse({ description: 'An internal server error occurred.' })
    public async deletePersonById(
        @Param() params: PersonByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const response: Result<void, DomainError> = await this.personDeleteService.deletePerson(
            params.personId,
            permissions,
        );
        const person: Option<Person<true>> = await this.personRepository.findById(params.personId);
        // Throw an HTTP exception if the delete response is an error
        if (!response.ok) {
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht den Benutzer ${person?.username} (BenutzerId: ${person?.id}) zu löschen. Fehler: ${response.error.message}`,
            );
            throw response.error;
        }
        this.logger.info(
            `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat Benutzer ${person?.username} (BenutzerId: ${person?.id}) gelöscht.`,
        );
    }

    @Get(':personId')
    @ApiOkResponse({ description: 'The person was successfully returned.', type: PersonendatensatzResponse })
    @ApiBadRequestResponse({ description: 'Person ID is required' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get the person.' })
    @ApiNotFoundResponse({ description: 'The person does not exist or insufficient permissions.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get the person.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting the person.' })
    public async findPersonById(
        @Param() params: PersonByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonendatensatzResponse> {
        //check that logged-in user is allowed to update person
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            params.personId,
            permissions,
        );
        if (!personResult.ok) {
            throw new EntityNotFoundError('Person', params.personId);
        }

        this.logger.info(`Getting PersonEmailResponse for PersonId ${personResult.value.id} using new Microservice`);
        const personEmailResponse: Option<PersonEmailResponse> = await this.emailResolverService.findEmailBySpshPerson(
            personResult.value.id,
        );

        const response: PersonendatensatzResponse = new PersonendatensatzResponse(
            personResult.value,
            false,
            personEmailResponse ? personEmailResponse : undefined,
        );

        return response;
    }

    /**
     * @deprecated This endpoint is no longer used.
     */
    @Post(':personId/personenkontexte')
    @UseGuards(StepUpGuard)
    @HttpCode(200)
    @ApiOperation({ deprecated: true })
    @ApiParam({ name: 'personId', type: String })
    @ApiOkResponse({ description: 'The personenkontext was successfully created.' })
    @ApiBadRequestResponse({ description: 'The personenkontext already exists.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to create the personenkontext.' })
    @ApiForbiddenResponse({ description: 'Not permitted to create the personenkontext.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to create personenkontext for person.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while creating the personenkontext.' })
    public createPersonenkontext(): Promise<PersonenkontextResponse> {
        throw new NotImplementedException();
    }

    @Get(':personId/personenkontexte')
    @ApiOkResponsePaginated(PersonenkontextResponse, {
        description: 'The personenkontexte were successfully pulled.',
        headers: PagingHeadersObject,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get personenkontexte.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get personenkontexte.' })
    @ApiNotFoundResponse({ description: 'No personenkontexte were found.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting all personenkontexte.' })
    public async findPersonenkontexte(
        @Param() pathParams: PersonByIdParams,
        @Query() queryParams: PersonenkontextQueryParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PagedResponse<PersonenkontextResponse>> {
        // check that logged-in user is allowed to update person
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            pathParams.personId,
            permissions,
        );
        if (!personResult.ok) {
            throw new EntityNotFoundError('Person', pathParams.personId);
        }

        const updatedQueryParams: PersonenkontextQueryParams = { ...queryParams, personId: personResult.value.id };
        // orgnisationID is undefined
        const personenkontexts: Paged<Personenkontext<true>> =
            await this.personenkontextService.findAllPersonenkontexte(
                updatedQueryParams,
                undefined,
                updatedQueryParams.offset,
                updatedQueryParams.limit,
            );

        const responseItems: PersonenkontextResponse[] = await Promise.all(
            personenkontexts.items.map(async (item: Personenkontext<true>) =>
                this.personApiMapper.mapToPersonenkontextResponse(item),
            ),
        );

        return new PagedResponse({
            items: responseItems,
            offset: personenkontexts.offset,
            limit: personenkontexts.limit,
            total: personenkontexts.total,
        });
    }

    @Put(':personId')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'The person was successfully updated.',
        type: PersonendatensatzResponse,
    })
    @ApiBadRequestResponse({ description: 'Request has wrong format.' })
    @ApiUnauthorizedResponse({ description: 'Request is not authorized.' })
    @ApiNotFoundResponse({ description: 'The person was not found or insufficient permissions to update person.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to perform operation.' })
    @ApiInternalServerErrorResponse({ description: 'An internal server error occurred.' })
    public async updatePerson(
        @Param() params: PersonByIdParams,
        @Body() body: UpdatePersonBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonendatensatzResponse> {
        //check that logged-in user is allowed to update person
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            params.personId,
            permissions,
        );
        if (!personResult.ok) {
            throw new EntityNotFoundError('Person', params.personId);
        }
        const updateResult: void | DomainError = personResult.value.update(
            body.revision,
            body.name.familienname,
            body.name.vorname,
            body.username,
            body.stammorganisation,
        );
        if (updateResult instanceof DomainError) {
            throw updateResult;
        }
        await this.personRepository.update(personResult.value);

        return new PersonendatensatzResponse(personResult.value, false);
    }

    @Patch(':personId/password')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiAcceptedResponse({ description: 'Password for person was successfully reset.', type: String })
    @ApiNotFoundResponse({ description: 'The person does not exist or insufficient permissions to update person.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
    @UseInterceptors(ResultInterceptor)
    public async resetPasswordByPersonId(
        @Param() params: PersonByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<Result<string>> {
        //check that logged-in user is allowed to update person
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            params.personId,
            permissions,
        );

        if (!personResult.ok) {
            const error: EntityNotFoundError = new EntityNotFoundError('Person', params.personId);
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht das Password des Benutzers mit BenutzerId ${params.personId} zurückzusetzen. Fehler: ${error.message}`,
            );
            throw error;
        }
        personResult.value.resetPassword();
        const saveResult: Person<true> | DomainError = await this.personRepository.update(personResult.value);

        if (saveResult instanceof DomainError) {
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht das Password des Benutzers ${personResult.value.username} mit BenutzerId ${personResult.value.id} zurückzusetzen. Fehler: ${saveResult.message}`,
            );
            throw saveResult;
        }
        this.logger.info(
            `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat das Passwort von Benutzer ${saveResult.username} (BenutzerId: ${saveResult.id}) zurueckgesetzt.`,
        );
        return { ok: true, value: personResult.value.newPassword! };
    }

    @Put(':personId/lock-user')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOkResponse({ description: 'User has been successfully updated.', type: PersonLockResponse })
    @ApiNotFoundResponse({ description: 'The person was not found.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to perform operation.' })
    @ApiInternalServerErrorResponse({ description: 'An internal server error occurred.' })
    @ApiBadGatewayResponse({ description: 'A downstream server returned an error.' })
    public async lockPerson(
        @Param('personId') personId: string,
        @Body() lockUserBodyParams: LockUserBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonLockResponse> {
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            personId,
            permissions,
        );

        if (!personResult.ok) {
            const error: NotFoundOrNoPermissionError = new NotFoundOrNoPermissionError(personId);
            if (lockUserBodyParams.lock) {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht einen Benutzer (BenutzerId: ${personId}) zu sperren. Fehler: ${error.message}.`,
                );
            } else {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht einen Benutzer (BenutzerId: ${personId}) zu entsperren. Fehler: ${error.message}.`,
                );
            }
            throw error;
        }

        if (!personResult.value?.keycloakUserId) {
            const error: PersonDomainError = new PersonDomainError(
                `Person with id ${personId} has no keycloak id`,
                personId,
            );
            if (lockUserBodyParams.lock) {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht den Benutzer ${personResult.value.username} (BenutzerId: ${personId}) zu sperren. Fehler: ${error.message}.`,
                );
            } else {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht den Benutzer ${personResult.value.username} (BenutzerId: ${personId}) zu entsperren. Fehler: ${error.message}.`,
                );
            }
            throw error;
        }

        const userLock: UserLock = {
            person: personId,
            locked_by: lockUserBodyParams.locked_by,
            locked_until: lockUserBodyParams.locked_until,
            locked_occasion: PersonLockOccasion.MANUELL_GESPERRT,
            created_at: undefined,
        };

        const result: Result<void, DomainError> = await this.keycloakUserService.updateKeycloakUserStatus(
            personId,
            personResult.value.keycloakUserId,
            userLock,
            lockUserBodyParams.lock,
        );
        if (!result.ok) {
            const error: DownstreamKeycloakError = new DownstreamKeycloakError(result.error.message, personId, [
                result.error.details,
            ]);
            if (lockUserBodyParams.lock) {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}, Sperrende Organisation: ${userLock.locked_by}) hat versucht den Benutzer ${personResult.value.username} (BenutzerId: ${personId}) zu sperren. Fehler: ${error.message}.`,
                );
            } else {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}, Sperrende Organisation: ${userLock.locked_by}) hat versucht den Benutzer ${personResult.value.username} (BenutzerId: ${personId}) zu entsperren. Fehler: ${error.message}.`,
                );
            }
            throw error;
        }
        if (lockUserBodyParams.lock) {
            this.logger.info(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}, Sperrende Organisation: ${userLock.locked_by}) hat Benutzer ${personResult.value.username} (BenutzerId: ${personId})) gesperrt (Befristung: ${userLock.locked_until?.toString() ?? 'unbefristet'}).`,
            );
        } else {
            this.logger.info(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}, Sperrende Organisation: ${userLock.locked_by}) hat Benutzer ${personResult.value.username} (BenutzerId: ${personId})) entsperrt (Befristung: ${userLock.locked_until?.toString() ?? 'unbefristet'}).`,
            );
        }
        return new PersonLockResponse(`User has been successfully ${lockUserBodyParams.lock ? '' : 'un'}locked.`);
    }

    @Post(':personId/sync')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ description: 'User will be synced.' })
    @ApiNotFoundResponse({ description: 'The person was not found.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to perform operation.' })
    @ApiInternalServerErrorResponse({ description: 'An internal server error occurred.' })
    @ApiBadGatewayResponse({ description: 'A downstream server returned an error.' })
    public async syncPerson(
        @Param('personId') personId: string,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            personId,
            permissions,
            [RollenSystemRecht.PERSON_SYNCHRONISIEREN],
        );
        if (!personResult.ok) {
            const error: NotFoundOrNoPermissionError = new NotFoundOrNoPermissionError(personId);
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id} hat versucht Benutzer mit BenutzerId: ${personId} neu zu synchronisieren. Fehler: ${error.message}`,
            );
            throw error;
        }

        this.eventService.publish(
            new PersonExternalSystemsSyncEvent(personId),
            new KafkaPersonExternalSystemsSyncEvent(personId),
        );
        this.logger.info(
            `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id} hat für Benutzer ${personResult.value.username} (BenutzerId: ${personResult.value.id}) eine Synchronisation durchgeführt.`,
        );
    }

    @Patch(':personId/metadata')
    @UseGuards(StepUpGuard)
    @ApiOkResponse({
        description: 'The metadata for user was successfully updated.',
        type: PersonendatensatzResponse,
    })
    @ApiBadRequestResponse({ description: 'Request has a wrong format.', type: DbiamPersonError })
    @ApiUnauthorizedResponse({ description: 'Not authorized to update the metadata.' })
    @ApiForbiddenResponse({ description: 'Not permitted to update the metadata.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while updating the metadata for user.' })
    public async updateMetadata(
        @Param() params: PersonByIdParams,
        @Body() body: PersonMetadataBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<PersonendatensatzResponse | DomainError> {
        if (
            body.personalnummer &&
            !(await this.dBiamPersonenkontextService.isPersonalnummerRequiredForAnyPersonenkontextForPerson(
                params.personId,
            ))
        ) {
            const error: PersonDomainError = new PersonDomainError(
                'Person hat keine koperspflichtige Rolle',
                undefined,
            );
            this.logger.info(
                `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht die persoenlichen Daten des Benutzers mit BenutzerId: ${params.personId} zu verändern. Fehler: ${error.message}`,
            );
            throw error;
        }
        const result: Person<true> | DomainError = await this.personRepository.updatePersonMetadata(
            params.personId,
            body.familienname,
            body.vorname,
            body.personalnummer,
            body.lastModified,
            body.revision,
            permissions,
        );

        if (result instanceof DomainError) {
            this.logger.info(
                `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat versucht die persoenlichen Daten des Benutzers mit BenutzerId: ${params.personId} zu verändern. Fehler: ${result.message}`,
            );

            throw result;
        }
        this.logger.info(
            `Admin ${permissions.personFields.username} (AdmindId: ${permissions.personFields.id}) hat die persoenlichen Daten von Benutzer ${result.username} (BenutzerId: ${result.id}) geändert.`,
        );
        return new PersonendatensatzResponse(result, false);
    }

    @Patch(':personId/uem-password')
    @UseGuards(StepUpGuard)
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiAcceptedResponse({ description: 'UEM-password for person was successfully reset.', type: String })
    @ApiNotFoundResponse({ description: 'The person does not exist or insufficient permissions to update person.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
    @UseInterceptors(ResultInterceptor)
    public async resetUEMPasswordByPersonId(
        @Param() params: PersonByIdParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<Result<string>> {
        //check that logged-in user is allowed to update person
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            params.personId,
            permissions,
        );
        if (!personResult.ok) {
            throw new EntityNotFoundError('Person', params.personId);
        }
        if (!personResult.value.username) {
            throw new PersonDomainError('Person-Username NOT defined', params.personId);
        }
        const changeUserPasswordResult: Result<PersonID> = await this.ldapClientAdapter.changeUserPasswordByPersonId(
            personResult.value.id,
            personResult.value.username,
        );
        this.eventService.publish(
            new PersonLdapSyncEvent(personResult.value.id),
            new KafkaPersonLdapSyncEvent(personResult.value.id),
        );

        if (!changeUserPasswordResult.ok) {
            throw new PersonUserPasswordModificationError(personResult.value.id);
        }

        return { ok: true, value: changeUserPasswordResult.value };
    }

    @Patch('uem-password')
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiAcceptedResponse({ description: 'UEM-password for person was successfully reset.', type: String })
    @ApiNotFoundResponse({ description: 'The person does not exist or insufficient permissions to update person.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error.' })
    @UseInterceptors(ResultInterceptor)
    public async resetUEMPassword(@Permissions() permissions: IPersonPermissions): Promise<Result<string>> {
        const { id, username }: PersonFields = permissions.personFields;
        if (!id) {
            throw new EntityNotFoundError('Person', id);
        }
        if (!username) {
            throw new PersonDomainError('Person-Username NOT defined', id);
        }
        const changeUserPasswordResult: Result<PersonID> = await this.ldapClientAdapter.changeUserPasswordByPersonId(
            id,
            username,
        );
        this.eventService.publish(new PersonLdapSyncEvent(id), new KafkaPersonLdapSyncEvent(id));

        if (!changeUserPasswordResult.ok) {
            throw new PersonUserPasswordModificationError(id);
        }

        return { ok: true, value: changeUserPasswordResult.value };
    }
}
