import { Injectable } from '@nestjs/common';
import { uniq } from 'lodash-es';
import { EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import { MultipleRollenartenError } from '../../../shared/error/multiple-rollenarten.error.js';
import { PersonID, RolleID } from '../../../shared/types/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import {
    DBiamPersonenkontextRepo,
    ErweiterterServiceProviderForPK,
    ExternalPkData,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';

type PermittedPersonenkontext = {
    dienststellennr: string;
    rolleId: RolleID;
    rollenart: RollenArt;
};

type ExternalPkDataWithRequiredFields = ExternalPkData & { kennung: string; rollenart: RollenArt };

type OptionalEmailData = {
    emailAdresse?: string;
    oxLoginId?: string;
};

export type UserExternalData = OptionalEmailData & {
    personId: string;
    vorname: string;
    nachname: string;
    rollenart: RollenArt;
    personenkontexte: Pick<PermittedPersonenkontext, 'dienststellennr' | 'rolleId'>[];
};

@Injectable()
export class UserExternaldataService {
    public constructor(
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly personRepository: PersonRepository,
        private readonly emailResolverService: EmailResolverService,
    ) {}

    // Decorator an controller um MissingPermissionsError auf 403 zu mappend

    public async getExternalData(
        keycloakSub: string,
        keycloakClient: string,
        includeEmailAddress: boolean,
    ): Promise<Result<UserExternalData, DomainError>> {
        const person: Option<Person<true>> = await this.personRepository.findByKeycloakUserId(keycloakSub);
        if (!person) {
            return Err(new EntityNotFoundError('Person', keycloakSub));
        }

        const permittedPersonenkontexte: PermittedPersonenkontext[] = await this.findPermittedPersonenkontexte(
            person.id,
            keycloakClient,
        );
        const permissionCheckResult: Result<void, MissingPermissionsError> = this.checkPermission(
            permittedPersonenkontexte,
            person.id,
            keycloakClient,
        );
        if (!permissionCheckResult.ok) {
            return permissionCheckResult;
        }

        const rollenartResult: Result<RollenArt, MultipleRollenartenError> =
            this.getSingleRollenart(permittedPersonenkontexte);
        if (!rollenartResult.ok) {
            return rollenartResult;
        }

        const emailDataResult: Result<OptionalEmailData, DomainError> = await this.resolveEmailData(
            person.id,
            includeEmailAddress,
        );
        if (!emailDataResult.ok) {
            return emailDataResult;
        }

        const userExternalData: UserExternalData = {
            personId: person.id,
            vorname: person.vorname,
            nachname: person.familienname,
            rollenart: rollenartResult.value,
            personenkontexte: this.mapToPersonenkontexte(permittedPersonenkontexte),
            ...emailDataResult.value,
        };

        return Ok(userExternalData);
    }

    private checkPermission(
        permittedPersonenkontexte: PermittedPersonenkontext[],
        personId: PersonID,
        keycloakClient: string,
    ): Result<void, MissingPermissionsError> {
        if (permittedPersonenkontexte.length === 0) {
            return Err(
                new MissingPermissionsError(
                    `Person ${personId} has no permission for Angebot with keycloakClient ${keycloakClient}`,
                ),
            );
        }

        return Ok(undefined);
    }

    private mapToPersonenkontexte(
        permittedPersonenkontexte: PermittedPersonenkontext[],
    ): Pick<PermittedPersonenkontext, 'dienststellennr' | 'rolleId'>[] {
        return permittedPersonenkontexte.map(
            (pk: PermittedPersonenkontext): Pick<PermittedPersonenkontext, 'dienststellennr' | 'rolleId'> => ({
                dienststellennr: pk.dienststellennr,
                rolleId: pk.rolleId,
            }),
        );
    }

    private async findPermittedPersonenkontexte(
        personId: PersonID,
        keycloakClient: string,
    ): Promise<PermittedPersonenkontext[]> {
        const [externalPkData, erweiterteSP]: [ExternalPkData[], ErweiterterServiceProviderForPK[]] = await Promise.all(
            [
                this.personenkontextRepo.findExternalPkData(personId),
                this.personenkontextRepo.findErweiterteSPByPersonId(personId),
            ],
        );

        const erweiterungenByPkId: Map<string, ServiceProvider<true>[]> = this.groupErweiterteSPByPkId(erweiterteSP);

        return this.filterPermittedPersonenkontexte(externalPkData, erweiterungenByPkId, keycloakClient);
    }

    private filterPermittedPersonenkontexte(
        externalPkData: ExternalPkData[],
        erweiterungenByPkId: Map<string, ServiceProvider<true>[]>,
        keycloakClient: string,
    ): PermittedPersonenkontext[] {
        const pkDataWithRequiredFields: ExternalPkDataWithRequiredFields[] = externalPkData.filter(
            (pk: ExternalPkData): pk is ExternalPkDataWithRequiredFields => Boolean(pk.kennung && pk.rollenart),
        );

        const permittedPkData: ExternalPkDataWithRequiredFields[] = pkDataWithRequiredFields.filter(
            (pk: ExternalPkDataWithRequiredFields) =>
                this.isPermittedForAngebot(pk, erweiterungenByPkId.get(pk.pkId) ?? [], keycloakClient),
        );

        const permittedPersonenkontexte: PermittedPersonenkontext[] = permittedPkData.map(
            (pk: ExternalPkDataWithRequiredFields): PermittedPersonenkontext => ({
                dienststellennr: pk.kennung,
                rolleId: pk.rolleId,
                rollenart: pk.rollenart,
            }),
        );

        return permittedPersonenkontexte;
    }

    private groupErweiterteSPByPkId(
        erweiterteSP: ErweiterterServiceProviderForPK[],
    ): Map<string, ServiceProvider<true>[]> {
        const erweiterungenByPkId: Map<string, ServiceProvider<true>[]> = new Map();
        for (const erweiterung of erweiterteSP) {
            const serviceProviders: ServiceProvider<true>[] =
                erweiterungenByPkId.get(erweiterung.personenkontext.id) ?? [];
            serviceProviders.push(erweiterung.serviceProvider);
            erweiterungenByPkId.set(erweiterung.personenkontext.id, serviceProviders);
        }

        return erweiterungenByPkId;
    }

    private isPermittedForAngebot(
        pk: ExternalPkData,
        erweiterteServiceProvider: ServiceProvider<true>[],
        keycloakClient: string,
    ): boolean {
        const serviceProviders: ServiceProvider<true>[] = [...(pk.serviceProvider ?? []), ...erweiterteServiceProvider];

        return serviceProviders.some((sp: ServiceProvider<true>) => sp.keycloakClient === keycloakClient);
    }

    private getSingleRollenart(
        permittedPersonenkontexte: PermittedPersonenkontext[],
    ): Result<RollenArt, MultipleRollenartenError> {
        const uniqueRollenarten: RollenArt[] = uniq(
            permittedPersonenkontexte.map((pk: PermittedPersonenkontext) => pk.rollenart),
        );
        if (uniqueRollenarten.length > 1) {
            return Err(new MultipleRollenartenError(uniqueRollenarten));
        }

        // safe: permittedPersonenkontexte is non-empty here, so uniqueRollenarten has exactly one entry
        return Ok(uniqueRollenarten[0] as RollenArt);
    }

    private async resolveEmailData(
        personId: PersonID,
        includeEmailAddress: boolean,
    ): Promise<Result<OptionalEmailData, DomainError>> {
        if (!includeEmailAddress) {
            return Ok({});
        }

        return this.resolveEmailDataFromMicroservice(personId);
    }

    private async resolveEmailDataFromMicroservice(personId: string): Promise<Result<OptionalEmailData, DomainError>> {
        const response: Result<EmailAddressResponse | undefined, DomainError> =
            await this.emailResolverService.findEmailBySpshPersonAsEmailAddressResponse(personId);
        if (!response.ok) {
            return response;
        }
        if (!response.value) {
            return Ok({});
        }

        const emailAdresse: string | undefined =
            response.value.status === EmailAddressStatusEnum.ACTIVE ? response.value.address : undefined;
        const oxLoginId: string | undefined =
            response.value.status !== EmailAddressStatusEnum.SUSPENDED ? response.value.oxLoginId : undefined;

        return Ok({
            emailAdresse: emailAdresse,
            oxLoginId: oxLoginId,
        });
    }
}
