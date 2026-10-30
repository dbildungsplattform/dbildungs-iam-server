import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { Hash, createHash } from 'crypto';
import { XMLBuilder } from 'fast-xml-parser';
import { setTimeout as sleep } from 'node:timers/promises';
import { lastValueFrom } from 'rxjs';

import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { ItsLearningConfig, ServerConfig } from '../../../../shared/config/index.js';
import { DomainError, ItsLearningError } from '../../../../shared/error/index.js';
import { IMS_MESS_BIND_SCHEMA } from '../../schemas.js';
import { ItslearningAction } from './actions/action.types.js';

@Injectable()
export class ItsLearningIMSESApiService {
    private readonly endpoint: string;

    private readonly username: string;

    private readonly password: string;

    private readonly xmlBuilder: XMLBuilder = new XMLBuilder({ ignoreAttributes: false });

    private readonly MAX_ATTEMPTS: number;

    private readonly RETRY_DELAY: number;

    public constructor(
        private readonly httpService: HttpService,
        private readonly logger: ClassLogger,
        configService: ConfigService<ServerConfig>,
    ) {
        const itsLearningConfig: ItsLearningConfig = configService.getOrThrow<ItsLearningConfig>('ITSLEARNING');

        this.endpoint = itsLearningConfig.ENDPOINT;
        this.username = itsLearningConfig.USERNAME;
        this.password = itsLearningConfig.PASSWORD;

        this.MAX_ATTEMPTS = itsLearningConfig.MAX_ATTEMPTS;
        this.RETRY_DELAY = itsLearningConfig.RETRY_DELAY_MS;
    }

    public async send<ResultType>(
        action: ItslearningAction<ResultType>,
        syncId?: string,
    ): Promise<Result<ResultType, DomainError>> {
        // Offen (später klären): itslearning-Rate-Limit beim Anbieter ist mir nicht bekannt. Es gibt bisher keinen Deckel für
        // parallele Requests. Die Last pro Pod ist dadurch unbegrenzt, Gesamtlast = Pods × parallele Requests.
        // Vor dem Produktivbetrieb entscheiden, ob hier eine Semaphore mit ITSLEARNING-Config nötig ist.
        return this.sendWithRetry(action, syncId);
    }

    private async sendWithRetry<ResultType>(
        action: ItslearningAction<ResultType>,
        syncId?: string,
        currentAttempt: number = 0,
    ): Promise<Result<ResultType, DomainError>> {
        const body: object = action.buildRequest();
        const message: string = this.createMessage(body, syncId);

        try {
            const response: AxiosResponse<string> = await lastValueFrom(
                this.httpService.post(this.endpoint, message, {
                    headers: {
                        'Content-Type': 'text/xml;charset=UTF-8',
                        SOAPAction: `"${action.action}"`,
                    },
                }),
            );

            return action.parseResponse(response.data);
        } catch (err: unknown) {
            if (currentAttempt + 1 < this.MAX_ATTEMPTS) {
                // Linear backoff
                const delay: number = this.RETRY_DELAY;

                this.logger.logUnknownAsWarning(
                    `[SyncID: ${syncId}] Request to itslearning failed, retrying in ${delay}ms`,
                    err,
                );

                await sleep(delay);

                return this.sendWithRetry(action, syncId, currentAttempt + 1);
            }

            // All retries failed, return error
            this.logger.logUnknownAsError(
                `[SyncID: ${syncId}] Request to itslearning failed all retries, aborting`,
                err,
            );

            return {
                ok: false,
                error: new ItsLearningError('Request failed', [err]),
            };
        }
    }

    private createMessage(body: object, syncId?: string): string {
        return this.xmlBuilder.build({
            'soapenv:Envelope': {
                '@_xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',

                'soapenv:Header': this.createSecurityObject(syncId),

                'soapenv:Body': body,
            },
        });
    }

    private createSecurityObject(syncId?: string): object {
        const now: string = new Date().toISOString();
        const nHash: Hash = createHash('sha1');
        nHash.update(now + Math.random());
        const nonce: string = nHash.digest('base64');

        return {
            'ims:syncRequestHeaderInfo': syncId && {
                '@_xmlns:ims': IMS_MESS_BIND_SCHEMA,
                'ims:messageIdentifier': syncId,
            },
            'wsse:Security': {
                '@_xmlns:wsse': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
                '@_xmlns:wsu': 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
                '@_soapenv:mustUnderstand': 1,

                'wsse:UsernameToken': {
                    'wsse:Username': this.username,
                    'wsse:Password': {
                        '@_Type':
                            'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText',

                        '#text': this.password,
                    },
                    'wsse:Nonce': {
                        '@_EncodingType':
                            'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary',
                        '#text': nonce,
                    },
                    'wsu:Created': now,
                },
            },
        };
    }
}
