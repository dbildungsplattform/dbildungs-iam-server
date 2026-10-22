import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpException,
    HttpStatus,
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
    ApiNotFoundResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { EntityCouldNotBeCreated } from '../../shared/error/entity-could-not-be-created.error.js';
import { EntityCouldNotBeUpdated } from '../../shared/error/entity-could-not-be-updated.error.js';
import { IPersonPermissions } from '../../shared/permissions/person-permissions.interface.js';
import { PersonUsername } from '../../shared/types/aggregate-ids.types.js';
import { Permissions } from '../authentication/api/permissions.decorator.js';
import { StepUpGuard } from '../authentication/api/steup-up.guard.js';
import { Person } from '../person/domain/person.js';
import { PersonRepository } from '../person/persistence/person.repository.js';
import { AssignHardwareTokenBodyParams } from './api/assign-hardware-token.body.params.js';
import { AssignHardwareTokenResponse } from './api/assign-hardware-token.response.js';
import { DbiamPrivacyIdeaAdministrationError } from './api/error/dbiam-privacy-idea-administration.error.js';
import { SoftwareTokenInitializationError } from './api/error/software-token-initialization.error.js';
import { TokenError } from './api/error/token.error.js';
import { PrivacyIdeaAdministrationExceptionFilter } from './api/privacy-idea-administration-exception-filter.js';
import { TokenRequiredResponse } from './api/token-required.response.js';
import { PrivacyIdeaAdministrationService } from './privacy-idea-administration.service.js';
import { AssignTokenResponse, PrivacyIdeaToken, ResetTokenResponse } from './privacy-idea-api.types.js';
import { TokenInitBodyParams } from './token-init.body.params.js';
import { TokenStateResponse } from './token-state.response.js';
import { TokenVerifyBodyParams } from './token-verify.params.js';

@UseFilters(new PrivacyIdeaAdministrationExceptionFilter())
@ApiTags('2FA')
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@Controller('2fa-token')
export class PrivacyIdeaAdministrationController {
    public constructor(
        private readonly privacyIdeaAdministrationService: PrivacyIdeaAdministrationService,
        private readonly personRepository: PersonRepository,
        private logger: ClassLogger,
    ) {}

    @Post('init')
    @HttpCode(HttpStatus.CREATED)
    @ApiCreatedResponse({ description: 'The token was successfully created.', type: String })
    @ApiBadRequestResponse({ description: 'A username was not given or not found.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to create token.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to create token.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to create token.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while creating a token.' })
    public async initializeSoftwareToken(
        @Body() params: TokenInitBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<string> {
        const selfService: boolean = params.personId === permissions.personFields.id;
        try {
            const username: string = await this.getUsernameIfAllowedOrSelf(params.personId, permissions);
            const result: string = await this.privacyIdeaAdministrationService.initializeSoftwareToken(
                username,
                selfService,
            );

            if (!selfService) {
                this.logger.info(
                    `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat für Benutzer ${username} (BenutzerId: ${params.personId}) den 2FA Token zurückgesetzt. Seriennummer: <Token ID> (Seriennummer nur falls HW Token!)`,
                );
            }
            return result;
        } catch (error) {
            if ((error instanceof HttpException || error instanceof SoftwareTokenInitializationError) && !selfService) {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat versucht Benutzer mit BenutzerId: ${params.personId} einen Software-Token einzurichten. Fehler: ${error.message}`,
                );
            }
            throw error;
        }
    }

    @Get('state')
    @HttpCode(HttpStatus.OK)
    @ApiCreatedResponse({ description: 'The token state was successfully returned.', type: TokenStateResponse })
    @ApiBadRequestResponse({
        description: 'A username was not given or not found.',
        type: DbiamPrivacyIdeaAdministrationError,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get token state.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get token state.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to get token state.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while retrieving token state.' })
    public async getTwoAuthState(
        @Query('personId') personId: string,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<TokenStateResponse> {
        const username: PersonUsername = await this.getUsernameIfAllowedOrSelf(personId, permissions);
        const piToken: PrivacyIdeaToken | undefined =
            await this.privacyIdeaAdministrationService.getTwoAuthState(username);
        return new TokenStateResponse(piToken);
    }

    @Put('reset')
    @HttpCode(HttpStatus.OK)
    @ApiCreatedResponse({ description: 'The token was successfully reset.', type: Boolean })
    @ApiBadRequestResponse({ description: 'A username was not given or not found.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to reset token.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to reset token.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to reset token.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while reseting a token.' })
    @UseGuards(StepUpGuard)
    public async resetToken(
        @Query('personId') personId: string,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<boolean> {
        const username: PersonUsername = await this.getUsernameIfAllowed(personId, permissions);
        try {
            const response: ResetTokenResponse = await this.privacyIdeaAdministrationService.resetToken(username);
            this.logger.info(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat für Benutzer ${username} (BenutzerId: ${personId}) den 2FA Token zurückgesetzt.`,
            );
            return response.result.status;
        } catch (error) {
            if (error instanceof TokenError) {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat versucht den 2FA Token von Benutzer mit BenutzerId: ${personId} zurückzusetzen. Fehler: ${error.message}`,
                );
                throw error;
            }
            const entityCouldNotBeUpdatedError: EntityCouldNotBeUpdated = new EntityCouldNotBeUpdated(
                username,
                'Token could not be unassigned.',
            );
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat versucht den 2FA Token von Benutzer mit BenutzerId: ${personId} zurückzusetzen. Fehler: ${entityCouldNotBeUpdatedError.message}`,
            );
            throw entityCouldNotBeUpdatedError;
        }
    }

    @Post('assign/hardwareToken')
    @HttpCode(HttpStatus.OK)
    @ApiCreatedResponse({
        description: 'The hardware token was successfully assigned.',
        type: AssignHardwareTokenResponse,
    })
    @ApiBadRequestResponse({ description: 'Not found.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to assign hardware token.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to reset token.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to assign hardware token.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while assigning a hardware token.' })
    public async assignHardwareToken(
        @Body() params: AssignHardwareTokenBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<AssignHardwareTokenResponse | undefined> {
        const username: PersonUsername = await this.getUsernameIfAllowed(params.userId, permissions);
        try {
            const result: AssignTokenResponse = await this.privacyIdeaAdministrationService.assignHardwareToken(
                params.serial,
                params.otp,
                username,
            );
            this.logger.info(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat Benutzer ${username} (BenutzerId: ${params.userId}) ein Hardware-Token zugewiesen. Seriennummer: ${params.serial}`,
            );
            return new AssignHardwareTokenResponse(
                result.id,
                result.jsonrpc,
                result.time,
                result.version,
                result.versionnumber,
                result.signature,
                'Token wurde erfolgreich zugeordnet.',
            );
        } catch (error) {
            if (error instanceof TokenError) {
                this.logger.error(
                    `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat versucht Benutzer ${username} (BenutzerId: ${params.userId}) einen Hardware-Token zuzuweisen. Fehler: ${error.message}`,
                );
                throw error;
            }
            const entityCouldNotBeCreatedError: EntityCouldNotBeCreated = new EntityCouldNotBeCreated(
                'Hardware-Token could not be assigned.',
            );
            this.logger.error(
                `Admin ${permissions.personFields.username} (AdminId: ${permissions.personFields.id}) hat versucht Benutzer ${username} (BenutzerId: ${params.userId}) einen Hardware-Token zuzuweisen. Fehler: ${entityCouldNotBeCreatedError.message}`,
            );
            throw entityCouldNotBeCreatedError;
        }
    }

    @Post('verify')
    @HttpCode(HttpStatus.CREATED)
    @ApiCreatedResponse({ description: 'The token was successfully verified.' })
    @ApiBadRequestResponse({ description: 'A username was not given or not found.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to verify token.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to verify token.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to verify token.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while verifying a token.' })
    public async verifyToken(
        @Body() params: TokenVerifyBodyParams,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<void> {
        const username: PersonUsername = await this.getUsernameIfAllowedOrSelf(params.personId, permissions);
        try {
            await this.privacyIdeaAdministrationService.verifyTokenEnrollment(username, params.otp);
            this.logger.info(
                `Benutzer ${username} (BenutzerId: ${params.personId}) hat sich einen Software-Token für 2FA eingerichtet.`,
            );
        } catch (error) {
            this.logger.error(
                `Benutzer ${username} (BenutzerId: ${params.personId}) hat versucht eine 2FA einzurichten.`,
                error,
            );
            throw error;
        }
    }

    @Get('required')
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({
        description: 'The requirement was successfully returned.',
        type: TokenRequiredResponse,
    })
    @ApiBadRequestResponse({ description: 'A username was not given or not found.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to get requirement information.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to get requirement information.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to get requirement information.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while getting requirement information.' })
    public async requiresTwoFactorAuthentication(
        @Query('personId') personId: string,
        @Permissions() permissions: IPersonPermissions,
    ): Promise<TokenRequiredResponse> {
        if (personId !== permissions.personFields.id) {
            await this.getUsernameIfAllowedOrSelf(personId, permissions);
        }

        const requires2fa: boolean = await this.privacyIdeaAdministrationService.requires2fa(personId);
        return new TokenRequiredResponse(requires2fa);
    }

    private async getUsernameIfAllowed(personId: string, permissions: IPersonPermissions): Promise<string> {
        const personResult: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
            personId,
            permissions,
        );
        if (!personResult.ok) {
            throw new HttpException(personResult.error, HttpStatus.FORBIDDEN);
        }
        if (personResult.value.username === undefined) {
            throw new HttpException('User not found.', HttpStatus.BAD_REQUEST);
        }
        return personResult.value.username;
    }

    private async getUsernameIfAllowedOrSelf(
        personId: string,
        permissions: IPersonPermissions,
    ): Promise<PersonUsername> {
        if (personId === permissions.personFields.id) {
            const person: Option<Person<true>> = await this.personRepository.findById(personId);
            if (!person?.username) {
                throw new HttpException('User not found.', HttpStatus.BAD_REQUEST);
            }
            return person.username;
        } else {
            return this.getUsernameIfAllowed(personId, permissions);
        }
    }
}
