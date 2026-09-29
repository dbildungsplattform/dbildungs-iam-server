import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Client, TokenSet } from 'openid-client';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { SystemConfig } from '../../../shared/config/system.config.js';
import { updateAndGetStepUpLevel } from '../passport/oidc.strategy.js';
import { OIDC_CLIENT } from './oidc-client.service.js';

/**
 * Checks the Access Token and refreshes it if need be.
 * If everything is expired user is logged out
 */

@Injectable()
export class SessionAccessTokenMiddleware implements NestMiddleware {
    private readonly STEP_UP_TIMEOUT_IN_SECONDS: number;

    private readonly STEP_UP_TIMEOUT_ENABLED: boolean;

    public constructor(
        @Inject(OIDC_CLIENT) private readonly client: Client,
        private readonly logger: ClassLogger,
        configService: ConfigService<ServerConfig>,
    ) {
        this.STEP_UP_TIMEOUT_IN_SECONDS = configService.getOrThrow<SystemConfig>('SYSTEM').STEP_UP_TIMEOUT_IN_SECONDS;
        this.STEP_UP_TIMEOUT_ENABLED =
            configService.getOrThrow<SystemConfig>('SYSTEM').STEP_UP_TIMEOUT_ENABLED === 'true';
    }

    public async use(req: Request, _res: Response, next: (error?: unknown) => void): Promise<void> {
        const accessToken: string | undefined = req.passportUser?.access_token;
        const refreshToken: string | undefined = req.passportUser?.refresh_token;

        if (this.STEP_UP_TIMEOUT_ENABLED) {
            updateAndGetStepUpLevel(req, this.STEP_UP_TIMEOUT_IN_SECONDS);
        }

        if (accessToken) {
            const isAccessTokenActive: boolean = (await this.client.introspect(accessToken, 'access_token')).active;
            if (!isAccessTokenActive) {
                // Do we have a refresh token and somewhere to store the result of the refresh?
                const isRefreshTokenActive: boolean =
                    refreshToken !== undefined && (await this.client.introspect(refreshToken, 'refresh_token')).active;
                if (refreshToken && isRefreshTokenActive && req.passportUser) {
                    try {
                        const tokens: TokenSet = await this.client.refresh(refreshToken);
                        if (tokens) {
                            req.passportUser.refresh_token = tokens.refresh_token;
                            req.passportUser.access_token = tokens.access_token;
                            req.passportUser.id_token = tokens.id_token;
                            req.passportUser.userinfo = await this.client.userinfo(tokens);
                        }
                    } catch (e: unknown) {
                        if (e instanceof Error) {
                            this.logger.warning(e.message);
                        } else {
                            this.logger.warning('Refreshing Token Failed With Unknown Catch', e);
                        }
                    }
                } else {
                    this.logger.info(
                        `Attempting to logout user ${req.passportUser?.userinfo.sub}. refreshToken:${!!refreshToken}, isRefreshTokenActive:${isRefreshTokenActive}, passportUser:${!!req.passportUser}`,
                    );
                    req.logout((err: unknown) => {
                        if (err) {
                            this.logger.logUnknownAsError('Logout Failed', err, false);
                            this.logger.error(`Logout of user ${req.passportUser?.userinfo.sub} failed`);
                        }
                    });
                }
            }
        }
        next();
    }
}
