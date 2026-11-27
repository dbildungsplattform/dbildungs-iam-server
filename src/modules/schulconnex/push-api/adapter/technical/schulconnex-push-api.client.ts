import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { setTimeout as sleep } from 'node:timers/promises';
import { lastValueFrom } from 'rxjs';

import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { ServerConfig } from '../../../../../shared/config/index.js';
import { SchulconnexConfig } from '../../../../../shared/config/schulconnex.config.js';
import { DomainError, SchulconnexPushError } from '../../../../../shared/error/index.js';
import { PersonID, PersonenkontextID } from '../../../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../../../shared/util/result.js';
import { PersonInfoKontextDtoV2 } from '../../../api/personinfo/v2/person-info-kontext.response.v2.js';
import { PersonInfoPersonDtoV2 } from '../../../api/personinfo/v2/person-info-person.response.v2.js';
import { SchulconnexPushRegistry } from '../../domain/schulconnex-push-registry.js';

/** Payloads as defined in push-api/spec/components/schemas */
type PushPersonPayload = {
    referrer: string;
    name: { familienname: string; vorname: string };
};

type PushPersonDeletePayload = Record<string, never>;

type PushPersonenkontextPayload = {
    referrer: string;
    rolle: string;
    spshRolleId: string;
    erreichbarkeiten: { typ: string; kennung: string }[];
    personenstatus: string | null;
    organisation: { id: string; kennung: string; name: string };
};

type HttpMethod = 'PUT' | 'DELETE';

const HTTP_STATUS_REQUEST_TIMEOUT: number = 408;
const HTTP_STATUS_TOO_MANY_REQUESTS: number = 429;
const OIDC_TOKEN_MAX_RETRIES: number = 3;

@Injectable()
export class SchulconnexPushApiClient {

    public static readonly PUSH_OIDC_SECRET_PREFIX: string = 'SCHULCONNEX_PUSH_OIDC_SECRET_';

    private readonly maxAttempts: number;

    private readonly retryDelayMs: number;

    private readonly requestTimeoutMs: number;

    public constructor(
        private readonly httpService: HttpService,
        private readonly logger: ClassLogger,
        configService: ConfigService<ServerConfig>,
    ) {
        const config: SchulconnexConfig = configService.getOrThrow<SchulconnexConfig>('SCHULCONNEX');

        this.maxAttempts = config.PUSH_MAX_ATTEMPTS;
        this.retryDelayMs = config.PUSH_RETRY_DELAY_MS;
        this.requestTimeoutMs = config.PUSH_REQUEST_TIMEOUT_MS;
    }

    /** PUT /v1/personen/{personId} */
    public async upsertPerson(
        registry: SchulconnexPushRegistry<true>,
        personId: PersonID,
        person: PersonInfoPersonDtoV2,
    ): Promise<Result<void, DomainError>> {
        const payload: PushPersonPayload = {
            referrer: personId,
            name: { familienname: person.name.familienname, vorname: person.name.vorname },
        };
        const personPath: string = this.personPath(personId);

        const result: Result<void, DomainError> = await this.send(registry, 'PUT', personPath, payload);

        return result;
    }

    /** DELETE /v1/personen/{personId} */
    public async deletePerson(
        registry: SchulconnexPushRegistry<true>,
        personId: PersonID,
    ): Promise<Result<void, DomainError>> {
        const payload: PushPersonDeletePayload = {};
        const personPath: string = this.personPath(personId);

        const result: Result<void, DomainError> = await this.send(registry, 'DELETE', personPath, payload);

        return result;
    }

    /** PUT /v1/personen/{personId}/personenkontexte/{personenkontextId} */
    public async upsertPersonenkontext(
        registry: SchulconnexPushRegistry<true>,
        personId: PersonID,
        kontext: PersonInfoKontextDtoV2,
    ): Promise<Result<void, DomainError>> {
        const { organisation }: PersonInfoKontextDtoV2 = kontext;
        if (organisation.kennung === undefined || organisation.name === undefined) {
            return Err(
                new SchulconnexPushError(
                    `Organisation ${organisation.id} of personenkontext ${kontext.id} needs a kennung and a name to be pushed`,
                ),
            );
        }
        const payload: PushPersonenkontextPayload = {
            referrer: kontext.id,
            rolle: kontext.rolle,
            spshRolleId: kontext.spshRolleId,
            erreichbarkeiten: kontext.erreichbarkeiten.map((erreichbarkeit: { typ: string; kennung: string }) => ({
                typ: erreichbarkeit.typ,
                kennung: erreichbarkeit.kennung,
            })),
            personenstatus: kontext.personenstatus ?? null,
            organisation: { id: organisation.id, kennung: organisation.kennung, name: organisation.name },
        };
        const personenkontextPath: string = this.personenkontextPath(personId, kontext.id);

        const result: Result<void, DomainError> = await this.send(registry, 'PUT', personenkontextPath, payload);

        return result;
    }

    /** DELETE /v1/personen/{personId}/personenkontexte/{personenkontextId} */
    public async deletePersonenkontext(
        registry: SchulconnexPushRegistry<true>,
        personId: PersonID,
        personenkontextId: PersonenkontextID,
    ): Promise<Result<void, DomainError>> {
        return this.send(registry, 'DELETE', this.personenkontextPath(personId, personenkontextId));
    }

    private personPath(personId: PersonID): string {
        return `/v1/personen/${encodeURIComponent(personId)}`;
    }

    private personenkontextPath(personId: PersonID, personenkontextId: PersonenkontextID): string {
        return `${this.personPath(personId)}/personenkontexte/${encodeURIComponent(personenkontextId)}`;
    }

    private buildUrl(registry: SchulconnexPushRegistry<true>, path: string): string {
        return `${registry.baseUrl.replace(/\/$/, '')}${path}`;
    }

    private async send(
        registry: SchulconnexPushRegistry<true>,
        method: HttpMethod,
        path: string,
        data?: object,
    ): Promise<Result<void, DomainError>> {
        const { oidcTokenEndpoint, oidcClientId, oidcClientSecretRef }: SchulconnexPushRegistry<true> = registry;
        if (!oidcTokenEndpoint?.trim() || !oidcClientId?.trim() || !oidcClientSecretRef?.trim()) {
            return Err(new SchulconnexPushError(`Missing OIDC configuration for registry ${registry.id}`));
        }
        if (!this.isValidClientSecretReference(oidcClientSecretRef)) {
            return Err(new SchulconnexPushError(`Invalid OIDC client secret reference for registry ${registry.id}`));
        }
        const clientSecret: string | undefined = process.env[this.constructClientSecretReference(oidcClientSecretRef)];
        if (!clientSecret?.trim()) {
            return Err(new SchulconnexPushError(`OIDC client secret not configured for registry ${registry.id}`));
        }

        const tokenResult: Result<string, DomainError> = await this.fetchAccessToken(
            oidcTokenEndpoint,
            oidcClientId,
            clientSecret,
        );
        if (!tokenResult.ok) {
            return tokenResult;
        }

        const url: string = this.buildUrl(registry, path);
        const result: Result<unknown, DomainError> = await this.sendWithRetry(
            { method, url, data, headers: { Authorization: `Bearer ${tokenResult.value}` } },
            `Push request ${method} ${url}`,
        );

        return result.ok ? Ok() : result;
    }

    private async fetchAccessToken(
        tokenEndpoint: string,
        clientId: string,
        clientSecret: string,
    ): Promise<Result<string, DomainError>> {
        const data: URLSearchParams = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        });
        const result: Result<{ access_token?: unknown }, DomainError> = await this.sendWithRetry(
            {
                method: 'POST',
                url: tokenEndpoint,
                data: data.toString(),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            },
            'OIDC token request',
            Math.min(this.maxAttempts, OIDC_TOKEN_MAX_RETRIES + 1),
        );
        if (!result.ok) {
            return result;
        }

        const accessToken: unknown = result.value?.access_token;
        if (typeof accessToken !== 'string' || !/^[A-Za-z0-9._~+/-]+=*$/.test(accessToken)) {
            return Err(new SchulconnexPushError('OIDC token response did not contain a valid access token'));
        }

        return Ok(accessToken);
    }

    private async sendWithRetry<T>(
        request: AxiosRequestConfig,
        description: string,
        maxAttempts: number = this.maxAttempts,
        attempt: number = 1,
    ): Promise<Result<T, DomainError>> {
        try {
            const response: AxiosResponse<T> = await lastValueFrom(
                this.httpService.request<T>({ ...request, timeout: this.requestTimeoutMs, maxRedirects: 0 }),
            );

            return Ok(response.data);
        } catch (err: unknown) {
            // Axios errors can contain the client secret or bearer token in the request config.
            const status: number | undefined = isAxiosError(err) ? err.response?.status : undefined;
            const failure: string = `${description} failed${status === undefined ? '' : ` (HTTP ${status})`}`;
            if (this.isRetryable(status) && attempt < maxAttempts) {
                this.logger.warning(
                    `${failure} (attempt ${attempt}/${maxAttempts}), retrying in ${this.retryDelayMs}ms`,
                );

                await sleep(this.retryDelayMs);

                return this.sendWithRetry(request, description, maxAttempts, attempt + 1);
            }

            this.logger.error(`${failure}, aborting`);

            return Err(new SchulconnexPushError(failure));
        }
    }

    private isValidClientSecretReference(oidcClientSecretRef: string): boolean {
        return /^[A-Z0-9_]+$/.test(oidcClientSecretRef);
    }

    private constructClientSecretReference(oidcClientSecretRef: string): string {
        return `${SchulconnexPushApiClient.PUSH_OIDC_SECRET_PREFIX}${oidcClientSecretRef}`;
    }

    /** Client errors (4xx) won't succeed by repeating the same request, except for timeouts and rate limiting. */
    private isRetryable(status: number | undefined): boolean {
        if (status === undefined || status >= 500) {
            return true;
        }

        return status === HTTP_STATUS_REQUEST_TIMEOUT || status === HTTP_STATUS_TOO_MANY_REQUESTS;
    }
}
