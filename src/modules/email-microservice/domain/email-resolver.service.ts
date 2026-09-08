import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { lastValueFrom } from 'rxjs';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { SetEmailAddressForSpshPersonBodyParams } from '../../../email/modules/core/api/dtos/params/set-email-address-for-spsh-person.bodyparams.js';
import { EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import { EmailMicroserviceConfig } from '../../../shared/config/email-microservice.config.js';
import { HeaderApiKeyConfig } from '../../../shared/config/headerapikey.config.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { EmailMicroserviceCommunicationError } from '../../../shared/error/index.js';
import { PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { PersonEmailResponse } from '../../person/api/person-email-response.js';
import { Person } from '../../person/domain/person.js';

export interface PersonIdWithEmailResponse {
    personId: string;
    personEmailResponse: PersonEmailResponse;
}

@Injectable()
export class EmailResolverService {
    private static readPath: string = 'api/read';
    private static writePath: string = 'api/write';

    public constructor(
        private readonly logger: ClassLogger,
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
        private readonly emailRepo: EmailRepo,
    ) {}

    public async findEmailBySpshPerson(personId: string): Promise<Option<PersonEmailResponse>> {
        try {
            const response: AxiosResponse<EmailAddressResponse[]> = await lastValueFrom(
                this.httpService.get(this.getEndpoint() + `${EmailResolverService.readPath}/spshperson/${personId}`, {
                    headers: {
                        'api-key': this.getApiKey(),
                    },
                }),
            );
            if (response.data[0] !== undefined) {
                const status: EmailAddressStatus = this.mapStatus(response.data[0]?.status);
                return new PersonEmailResponse(status, response.data[0].address);
            }
            return undefined;
        } catch (error) {
            this.logger.logUnknownAsError(`Failed to fetch email for person ${personId}`, error);
            return undefined;
        }
    }

    public async findEmailsBySpshPersons(
        personIds: string[],
    ): Promise<Result<Map<PersonID, PersonEmailResponse | undefined>, DomainError>> {
        try {
            const response: AxiosResponse<EmailAddressResponse[]> = await lastValueFrom(
                this.httpService.post(
                    this.getEndpoint() + `${EmailResolverService.readPath}/spshpersons`,
                    {
                        spshPersonIds: personIds,
                    },
                    {
                        headers: {
                            'api-key': this.getApiKey(),
                        },
                    },
                ),
            );

            const result: Map<PersonID, PersonEmailResponse> = new Map<PersonID, PersonEmailResponse>(
                response.data.map((email: EmailAddressResponse) => [
                    email.spshPersonId as PersonID,
                    new PersonEmailResponse(this.mapStatus(email.status), email.address),
                ]),
            );

            return Ok(result);
        } catch (error) {
            this.logger.logUnknownAsError(`Failed to fetch emails for persons`, error);
            return Err(new EmailMicroserviceCommunicationError('Failed to fetch emails for persons'));
        }
    }

    public async findEmailBySpshPersonAsEmailAddressResponse(
        personId: string,
    ): Promise<Result<EmailAddressResponse | undefined, DomainError>> {
        try {
            const response: AxiosResponse<EmailAddressResponse[]> = await lastValueFrom(
                this.httpService.get(this.getEndpoint() + `${EmailResolverService.readPath}/spshperson/${personId}`, {
                    headers: {
                        'api-key': this.getApiKey(),
                    },
                }),
            );
            return Ok(response.data[0]);
        } catch (error) {
            this.logger.logUnknownAsError(`Failed to fetch email for person ${personId}`, error);
            return Err(new EntityNotFoundError('email-address', personId));
        }
    }

    public async findByPrimaryAddress(emailAddress: string): Promise<Option<PersonIdWithEmailResponse>> {
        try {
            const response: AxiosResponse<Option<EmailAddressResponse>> = await lastValueFrom(
                this.httpService.get(this.getEndpoint() + `${EmailResolverService.readPath}/email/${emailAddress}`, {
                    headers: {
                        'api-key': this.getApiKey(),
                    },
                }),
            );
            if (
                response.status === 200 &&
                response.data !== undefined &&
                response.data?.spshPersonId &&
                response.data.isPrimary
            ) {
                const status: EmailAddressStatus = this.mapStatus(response.data?.status);
                return {
                    personId: response.data.spshPersonId,
                    personEmailResponse: new PersonEmailResponse(status, response.data.address),
                };
            }
            return undefined;
        } catch (error) {
            this.logger.logUnknownAsError(`Failed to fetch email for address ${emailAddress}`, error);
            return undefined;
        }
    }

    public async setEmailForSpshPerson(params: {
        spshPersonId: string;
        spshUsername: string;
        kennungen: string[];
        firstName: string;
        lastName: string;
        spshServiceProviderId: string;
    }): Promise<void> {
        try {
            // For now just mocking the post
            this.logger.info(
                `Setting email for person ${params.spshPersonId} via email microservice with spId ${params.spshServiceProviderId}`,
            );
            this.logger.info(`Params: ${JSON.stringify(params)}`);
            await lastValueFrom(
                this.httpService.post(
                    this.getEndpoint() + `${EmailResolverService.writePath}/${params.spshPersonId}/set-email`,
                    {
                        spshUsername: params.spshUsername,
                        kennungen: params.kennungen,
                        firstName: params.firstName,
                        lastName: params.lastName,
                        spshServiceProviderId: params.spshServiceProviderId,
                    } satisfies SetEmailAddressForSpshPersonBodyParams,
                    {
                        headers: {
                            'api-key': this.getApiKey(),
                        },
                    },
                ),
            );
        } catch (error) {
            this.logger.logUnknownAsError(`Failed to set email for person ${params.spshPersonId}`, error);
        }
    }

    public async deleteEmailsForSpshPerson(params: { spshPersonId: string }): Promise<void> {
        try {
            this.logger.info(`Deleting email for person ${params.spshPersonId} via email microservice`);
            await lastValueFrom(
                this.httpService.delete(
                    this.getEndpoint() + `${EmailResolverService.writePath}/${params.spshPersonId}/delete-emails`,
                    {
                        headers: {
                            'api-key': this.getApiKey(),
                        },
                    },
                ),
            );
        } catch (error) {
            this.logger.logUnknownAsError(`Failed to delete emails for person ${params.spshPersonId}`, error);
        }
    }

    public async setEmailsSuspendedForSpshPerson(params: { spshPersonId: string }): Promise<void> {
        try {
            this.logger.info(`Setting emails for person ${params.spshPersonId} to suspended`);
            await lastValueFrom(
                this.httpService.post(
                    this.getEndpoint() + `${EmailResolverService.writePath}/${params.spshPersonId}/set-suspended`,
                    {},
                    {
                        headers: {
                            'api-key': this.getApiKey(),
                        },
                    },
                ),
            );
        } catch (error) {
            this.logger.logUnknownAsError(`Failed to set emails for person ${params.spshPersonId} to suspended`, error);
        }
    }

    public shouldUseEmailMicroservice(): boolean {
        const emailMicroserviceConfig: EmailMicroserviceConfig =
            this.configService.getOrThrow<EmailMicroserviceConfig>('EMAIL_MICROSERVICE');
        return emailMicroserviceConfig.USE_EMAIL_MICROSERVICE;
    }

    public async getPrimaryActiveEmailForPerson(person: Person<true>): Promise<string | undefined> {
        const email: Option<PersonEmailResponse> = this.shouldUseEmailMicroservice()
            ? await this.findEmailBySpshPerson(person.id)
            : await this.emailRepo.getEmailAddressAndStatusForPerson(person);
        return email?.status === EmailAddressStatus.ENABLED ? email.address : undefined;
    }

    // ==== Helper functions ====

    private getEndpoint(): string {
        const emailMicroserviceConfig: EmailMicroserviceConfig =
            this.configService.getOrThrow<EmailMicroserviceConfig>('EMAIL_MICROSERVICE');
        return emailMicroserviceConfig.ENDPOINT;
    }

    private getApiKey(): string {
        const headerApiKeyConfig: HeaderApiKeyConfig =
            this.configService.getOrThrow<HeaderApiKeyConfig>('HEADER_API_KEY');
        return headerApiKeyConfig.INTERNAL_COMMUNICATION_API_KEY;
    }

    private mapStatus(ease: EmailAddressStatusEnum): EmailAddressStatus {
        let eas: EmailAddressStatus = EmailAddressStatus.DISABLED;
        switch (ease) {
            case EmailAddressStatusEnum.PENDING:
                eas = EmailAddressStatus.REQUESTED;
                break;
            case EmailAddressStatusEnum.ACTIVE:
                eas = EmailAddressStatus.ENABLED;
                break;
            case EmailAddressStatusEnum.DEACTIVE:
                eas = EmailAddressStatus.DISABLED;
                break;
            case EmailAddressStatusEnum.SUSPENDED:
                eas = EmailAddressStatus.DISABLED;
                break;
            case EmailAddressStatusEnum.FAILED:
                eas = EmailAddressStatus.FAILED;
                break;
            case EmailAddressStatusEnum.EXISTS_ONLY_IN_OX:
                eas = EmailAddressStatus.FAILED;
                break;
            case EmailAddressStatusEnum.TO_BE_DELETED:
                eas = EmailAddressStatus.DELETED;
                break;
        }

        return eas;
    }
}
