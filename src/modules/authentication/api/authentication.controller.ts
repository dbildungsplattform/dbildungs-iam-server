import {
    Controller,
    Get,
    Inject,
    Req,
    Res,
    Session,
    UseGuards,
    Query,
    UnauthorizedException,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    ApiBearerAuth,
    ApiInternalServerErrorResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { SessionData } from 'express-session';
import { Client } from 'openid-client';

import { FrontendConfig, KeycloakConfig, ServerConfig } from '../../../shared/config/index.js';
import { OIDC_CLIENT } from '../services/oidc-client.service.js';
import { LoginGuard } from './login.guard.js';
import { RedirectQueryParams } from './redirect.query.params.js';
import { UserinfoExtension, UserinfoResponse } from './userinfo.response.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { PersonenkontextRolleWithOrganisation, PersonPermissions } from '../domain/person-permissions.js';
import { Permissions } from './permissions.decorator.js';
import { Public } from './public.decorator.js';
import { RolleID } from '../../../shared/types/index.js';
import { PersonenkontextRolleFieldsResponse } from './personen-kontext-rolle-fields.response.js';
import { RollenSystemRechtServiceProviderIDResponse } from './rolle-systemrechte-serviceproviderid.response.js';
import { KeycloakUserService } from '../../keycloak-administration/index.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { getLowestStepUpLevel } from '../passport/oidc.strategy.js';
import { PersonTimeLimitInfo } from '../../person/domain/person-time-limit-info.js';
import { PersonTimeLimitInfoResponse } from './person-time-limit-info.reponse.js';
import PersonTimeLimitService from '../../person/domain/person-time-limit-info.service.js';
import { ExternalPkData } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { OrganisationResponse } from '../../organisation/api/organisation.response.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { CsrfTokenResponse } from './csrf-token.response.js';
import { CsrfTokenService } from '../services/csrf-token.service.js';

type WithoutOptional<T> = {
    [K in keyof T]-?: T[K];
};

export type RequiredExternalPkData = WithoutOptional<ExternalPkData>;

@ApiTags('auth')
@Controller({ path: 'auth' })
export class AuthenticationController {
    private readonly defaultLoginRedirect: string;

    private readonly logoutRedirect: string;

    private readonly keyCloakclientRealm: string;

    public constructor(
        configService: ConfigService<ServerConfig>,
        @Inject(OIDC_CLIENT) private client: Client,
        private readonly logger: ClassLogger,
        private keycloakUserService: KeycloakUserService,
        private readonly personTimeLimitService: PersonTimeLimitService,
        private readonly csrfTokenService: CsrfTokenService,
    ) {
        const frontendConfig: FrontendConfig = configService.getOrThrow<FrontendConfig>('FRONTEND');
        const keycloakConfig: KeycloakConfig = configService.getOrThrow<KeycloakConfig>('KEYCLOAK');
        this.keyCloakclientRealm = keycloakConfig.REALM_NAME;
        this.defaultLoginRedirect = frontendConfig.DEFAULT_LOGIN_REDIRECT;
        this.logoutRedirect = frontendConfig.LOGOUT_REDIRECT;
    }

    @Get('login')
    @Public()
    @UseGuards(LoginGuard)
    @ApiOperation({ summary: 'Used to start OIDC authentication.' })
    @ApiResponse({ status: 302, description: 'Redirection to orchestrate OIDC flow.' })
    @ApiQuery({ type: RedirectQueryParams })
    public login(@Res() res: Response, @Session() session: SessionData): void {
        const target: string = session.passport?.user.redirect_uri ?? this.defaultLoginRedirect;
        res.redirect(target);
    }

    @Get('logout')
    @Public()
    @ApiBearerAuth()
    @ApiOAuth2(['openid'])
    @ApiOperation({ summary: 'Used to log out the current user.' })
    @ApiResponse({ status: 302, description: 'Redirect to logout.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while trying to log out.' })
    public logout(@Req() req: Request, @Res() res: Response): void {
        const idToken: string | undefined = req.passportUser?.id_token;

        req.logout((logoutErr?: Error) => {
            if (logoutErr) {
                // Error should not stop logout process
                this.logger.info('An error occurres while trying to log out', logoutErr);
            }

            req.session.destroy((destroyErr?: Error) => {
                if (destroyErr) {
                    // Error should not stop logout process
                    this.logger.info('An error occurred while trying to destroy the session', destroyErr);
                }

                if (this.client.issuer.metadata.end_session_endpoint) {
                    const endSessionUrl: string = this.client.endSessionUrl({
                        id_token_hint: idToken,
                        post_logout_redirect_uri: this.logoutRedirect,
                        client_id: this.client.metadata.client_id,
                    });

                    res.redirect(endSessionUrl);
                } else {
                    res.redirect(this.logoutRedirect);
                }
            });
        });
    }

    @Get('csrf-token')
    @Public()
    @ApiOperation({
        summary: 'Get CSRF token for session-based requests',
        description:
            'Returns a CSRF token that must be included in X-CSRF-Token header for state-changing requests (POST, PUT, DELETE). ' +
            'Call this endpoint after successful login. The token is stored in the session.',
    })
    @ApiOkResponse({
        description: 'CSRF token successfully retrieved for authenticated user',
        type: CsrfTokenResponse,
    })
    @ApiResponse({
        status: 401,
        description: 'User is not authenticated',
        type: UnauthorizedException,
    })
    public getCsrfToken(@Req() request: Request): CsrfTokenResponse {
        if (!request.isAuthenticated()) {
            this.logger.info('CSRF token requested by unauthenticated user');
            throw new UnauthorizedException('User is not authenticated');
        }

        try {
            // Generate new token or retrieve existing from session
            const token: string = request.session?.csrfToken || this.csrfTokenService.generateToken(request);

            this.logger.info('CSRF token provided to authenticated user');

            return new CsrfTokenResponse(token);
        } catch (error) {
            this.logger.error('Failed to generate CSRF token', error);
            throw new InternalServerErrorException('Failed to generate CSRF token');
        }
    }

    @Get('logininfo')
    @ApiBearerAuth()
    @ApiOAuth2(['openid'])
    @ApiOperation({ summary: 'Info about logged in user.' })
    @ApiUnauthorizedResponse({ description: 'User is not logged in.' })
    @ApiOkResponse({ description: 'Returns info about the logged in user.', type: UserinfoResponse })
    public async info(@Permissions() permissions: PersonPermissions, @Req() req: Request): Promise<UserinfoResponse> {
        const roleIds: RolleID[] = await permissions.getRoleIds();
        this.logger.info('Roles: ' + roleIds.toString());
        this.logger.info('User: ' + JSON.stringify(permissions.personFields));
        const rolleFields: PersonenkontextRolleWithOrganisation[] =
            await permissions.getPersonenkontexteWithRolesAndOrgs();
        const rolleFieldsResponse: PersonenkontextRolleFieldsResponse[] = rolleFields.map(
            (field: PersonenkontextRolleWithOrganisation) =>
                new PersonenkontextRolleFieldsResponse(
                    new OrganisationResponse(field.organisation),
                    new RollenSystemRechtServiceProviderIDResponse(
                        field.rolle.systemrechte.map((systemrecht: RollenSystemRecht) => systemrecht.name),
                        field.rolle.serviceProviderIds,
                    ),
                ),
        );
        const userinfoExtension: UserinfoExtension = {};
        if (permissions.personFields.keycloakUserId) {
            const lastPasswordChange: Result<Date, DomainError> = await this.keycloakUserService.getLastPasswordChange(
                permissions.personFields.keycloakUserId,
            );
            if (lastPasswordChange.ok) {
                userinfoExtension.password_updated_at = lastPasswordChange.value;
            }
        }

        const timeLimitInfos: PersonTimeLimitInfo[] = await this.personTimeLimitService.getPersonTimeLimitInfo(
            permissions.personFields.id,
        );
        const timeLimitInfosResponse: PersonTimeLimitInfoResponse[] = timeLimitInfos.map(
            (info: PersonTimeLimitInfo) => new PersonTimeLimitInfoResponse(info),
        );

        return new UserinfoResponse(
            permissions,
            rolleFieldsResponse,
            req.passportUser?.stepUpLevel ?? getLowestStepUpLevel(),
            timeLimitInfosResponse,
            userinfoExtension,
        );
    }

    @Get('reset-password')
    @Public()
    @ApiOperation({ summary: 'Redirect to Keycloak password reset.' })
    @ApiResponse({ status: 302, description: 'Redirect to Keycloak password reset page.' })
    public resetPassword(
        @Query('redirectUrl') redirectUrl: string,
        @Query('login_hint') login_hint: string,
        @Res() res: Response,
    ): void {
        const clientId: string = this.keyCloakclientRealm.toLowerCase();
        const responseType: string = 'code';
        const scope: string = 'openid';
        const kcAction: string = 'UPDATE_PASSWORD';
        const endpoint: string | undefined = this.client.issuer.metadata.authorization_endpoint;
        const setNewPasswordUrl: string = `${endpoint}?client_id=${clientId}&login_hint=${login_hint}&response_type=${responseType}&scope=${scope}&kc_action=${kcAction}&redirect_uri=${redirectUrl}`;
        res.redirect(setNewPasswordUrl);
    }
}
