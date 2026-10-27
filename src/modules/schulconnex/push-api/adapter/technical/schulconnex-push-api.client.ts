import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
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
export type PushPersonPayload = {
    referrer: string;
    name: { familienname: string; vorname: string };
};

export type PushPersonDeletePayload = Record<string, never>;

export type PushPersonenkontextPayload = {
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

@Injectable()
export class SchulconnexPushApiClient {
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

        return this.send(registry, 'PUT', this.personPath(personId), payload);
    }

    /** DELETE /v1/personen/{personId} */
    public async deletePerson(
        registry: SchulconnexPushRegistry<true>,
        personId: PersonID,
    ): Promise<Result<void, DomainError>> {
        const payload: PushPersonDeletePayload = {};

        return this.send(registry, 'DELETE', this.personPath(personId), payload);
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

        return this.send(registry, 'PUT', this.personenkontextPath(personId, kontext.id), payload);
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
        return `${registry.baseUrl.replace(/\/+$/, '')}${path}`;
    }

    private async send(
        registry: SchulconnexPushRegistry<true>,
        method: HttpMethod,
        path: string,
        data?: object,
    ): Promise<Result<void, DomainError>> {
        const url: string = this.buildUrl(registry, path);

        return this.sendWithRetry(method, url, data);
    }

    private async sendWithRetry(
        method: HttpMethod,
        url: string,
        data: object | undefined,
        attempt: number = 1,
    ): Promise<Result<void, DomainError>> {
        try {
            // axios has no timeout by default, a server that never responds would block forever
            await lastValueFrom(this.httpService.request({ method, url, data, timeout: this.requestTimeoutMs }));

            return Ok();
        } catch (err: unknown) {
            if (this.isRetryable(err) && attempt < this.maxAttempts) {
                this.logger.logUnknownAsWarning(
                    `Push request ${method} ${url} failed (attempt ${attempt}/${this.maxAttempts}), retrying in ${this.retryDelayMs}ms`,
                    err,
                );

                await sleep(this.retryDelayMs);

                return this.sendWithRetry(method, url, data, attempt + 1);
            }

            this.logger.logUnknownAsError(`Push request ${method} ${url} failed, aborting`, err);

            return Err(new SchulconnexPushError(`Push request ${method} ${url} failed`, [err]));
        }
    }

    /** Client errors (4xx) won't succeed by repeating the same request, except for timeouts and rate limiting. */
    private isRetryable(err: unknown): boolean {
        const status: number | undefined = isAxiosError(err) ? err.response?.status : undefined;

        if (status === undefined || status >= 500) {
            return true;
        }

        return status === HTTP_STATUS_REQUEST_TIMEOUT || status === HTTP_STATUS_TOO_MANY_REQUESTS;
    }
}
