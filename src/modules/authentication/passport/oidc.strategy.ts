import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
    AuthorizationParameters,
    type Client,
    Strategy,
    StrategyOptions,
    TokenSet,
    UserinfoResponse,
} from 'openid-client';

import { FrontendConfig, ServerConfig } from '../../../shared/config/index.js';
import { OIDC_CLIENT } from '../services/oidc-client.service.js';
import { PassportUser } from '../types/user.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Person } from '../../person/domain/person.js';
import { KeycloakUserNotFoundError } from '../domain/keycloak-user-not-found.error.js';
import { Request } from 'express';
import { decode, JwtPayload } from 'jsonwebtoken';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { PermissionsNotLoadedError } from '../domain/permissions-not-loaded.error.js';

export interface CustomJwtPayload extends JwtPayload {
    acr: StepUpLevel;
}

export enum StepUpLevel {
    NONE = 'none',
    SILVER = 'silver',
    GOLD = 'gold',
}

export function extractStepUpLevelFromJWT(jwt: string | undefined): StepUpLevel {
    if (!jwt) {
        return StepUpLevel.NONE;
    }
    const decoded: CustomJwtPayload | null = decode(jwt) as CustomJwtPayload | null;
    return decoded?.acr ?? StepUpLevel.NONE;
}

export function getLowestStepUpLevel(): StepUpLevel {
    return StepUpLevel.SILVER;
}

// timeout in seconds
export function isStepUpTimeOver(req: Request, timeout: number): boolean {
    const currentTime: number = Date.now();
    if (!req.session?.lastRouteChangeTime) {
        return false;
    }
    const lastRouteChangeTime: number = req.session.lastRouteChangeTime;
    const deltaTime: number = currentTime - lastRouteChangeTime;
    return deltaTime >= timeout * 1000;
}

export function updateAndGetStepUpLevel(req: Request, timeout: number): StepUpLevel {
    if (!req.session.lastRouteChangeTime) {
        req.session.lastRouteChangeTime = new Date().getTime();
    }

    if (isStepUpTimeOver(req, timeout)) {
        if (req.passportUser) {
            req.passportUser.stepUpLevel = getLowestStepUpLevel();
        }
    }

    req.session.lastRouteChangeTime = new Date().getTime();
    return req.passportUser?.stepUpLevel ?? getLowestStepUpLevel();
}

@Injectable()
export class OpenIdConnectStrategy extends PassportStrategy(Strategy, 'oidc') {
    public constructor(
        @Inject(OIDC_CLIENT) private client: Client,
        configService: ConfigService<ServerConfig>,
        private personRepo: PersonRepository,
        private readonly logger: ClassLogger,
    ) {
        const frontendConfig: FrontendConfig = configService.getOrThrow<FrontendConfig>('FRONTEND');

        super({
            client,
            usePKCE: true,
            params: { redirect_uri: frontendConfig.OIDC_CALLBACK_URL },
            passReqToCallback: true,
        } satisfies StrategyOptions);
    }

    public override authenticate(req: Request): void {
        const options: { acr_values: string } = {
            acr_values: req.session.requiredStepupLevel ?? StepUpLevel.SILVER,
        };

        super.authenticate(req, options);
    }

    public async validate(req: Request, tokenset: TokenSet): Promise<AuthorizationParameters & PassportUser> {
        let userinfo: UserinfoResponse;
        let person: Option<Person<true>>;

        try {
            userinfo = await this.client.userinfo(tokenset);
            person = await this.personRepo.findByKeycloakUserId(userinfo.sub);
        } catch (err: unknown) {
            this.logger.logUnknownAsWarning('Could not authorize user', err);
            throw new UnauthorizedException();
        }

        if (!person) {
            if (tokenset.access_token) {
                await this.client.revoke(tokenset.access_token, 'access_token');
            }

            throw new KeycloakUserNotFoundError();
        }

        const idToken: string | undefined = tokenset.id_token;
        const accessToken: string | undefined = tokenset.access_token;
        const refreshToken: string | undefined = tokenset.refresh_token;
        const stepUpLevel: StepUpLevel = extractStepUpLevelFromJWT(idToken);

        const user: AuthorizationParameters & PassportUser = {
            id_token: idToken,
            access_token: accessToken,
            refresh_token: refreshToken,
            userinfo: userinfo,
            personPermissions: () => Promise.reject(new PermissionsNotLoadedError()),
            redirect_uri: req.session?.redirectUrl,
            stepUpLevel: stepUpLevel,
        };
        return user;
    }
}
