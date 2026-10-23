import { uniq, uniqBy } from 'lodash-es';
import { type EmailAddressResponse } from '../../../email/modules/core/api/dtos/response/email-address.response.js';
import { EmailAddressStatusEnum } from '../../../email/modules/core/persistence/email-address-status.entity.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MultipleRollenartenError } from '../../../shared/error/index.js';
import { type EmailResolverService } from '../../email-microservice/domain/email-resolver.service.js';
import { type Person } from '../../person/domain/person.js';
import { type PersonRepository } from '../../person/persistence/person.repository.js';
import {
    type DBiamPersonenkontextRepo,
    type ErweiterterServiceProviderForPK,
    type ExternalPkData,
} from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { type RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { type RequiredExternalPkData } from '../api/authentication.controller.js';
import { type OxParams } from '../api/externaldata/user-externaldata-ox.response.js';

export const POLYTHEA_SERVICE_PROVIDER_ID: string = 'b2478ade-f0d1-4864-9713-a12c95cde898';
export class UserExternaldataWorkflowAggregate {
    public oxLoginId?: string;

    public person?: Person<true>;

    public email?: string;

    public checkedExternalPkData?: RequiredExternalPkData[];

    public erweiterteSP?: ErweiterterServiceProviderForPK[];

    public mergedExternalPkData?: RequiredExternalPkData[];

    public externalPkDataWithVidisAngebotId?: RequiredExternalPkData[];

    public vidisDienststellennummern?: string[];

    public singleRollenart?: RollenArt;

    public polytheaDienststellenNummern?: string[];

    public oxParams?: OxParams;

    private constructor(
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly personRepo: PersonRepository,
        private readonly emailResolverService: EmailResolverService,
    ) {}

    public static createNew(
        personenkontextRepo: DBiamPersonenkontextRepo,
        personRepo: PersonRepository,
        emailResolverService: EmailResolverService,
    ): UserExternaldataWorkflowAggregate {
        return new UserExternaldataWorkflowAggregate(personenkontextRepo, personRepo, emailResolverService);
    }

    public async initialize(personId: string): Promise<Option<DomainError>> {
        const person: Option<Person<true>> = await this.personRepo.findById(personId);
        const externalPkData: ExternalPkData[] = await this.personenkontextRepo.findExternalPkData(personId);
        this.erweiterteSP = await this.personenkontextRepo.findErweiterteSPByPersonId(personId);

        if (!person) {
            return new EntityNotFoundError('Person', personId);
        }
        this.person = person;

        const personEmailResponse: Result<
            Option<EmailAddressResponse>,
            DomainError
        > = await this.emailResolverService.findEmailBySpshPersonAsEmailAddressResponse(personId);

        this.email = undefined;
        this.oxLoginId = undefined;

        if (personEmailResponse.ok) {
            if (personEmailResponse.value) {
                if (personEmailResponse.value.status === EmailAddressStatusEnum.ACTIVE) {
                    this.email = personEmailResponse.value.address;
                }

                if (personEmailResponse.value.status !== EmailAddressStatusEnum.SUSPENDED) {
                    this.oxLoginId = personEmailResponse.value.oxLoginId;
                }
            }
        } else {
            return personEmailResponse.error;
        }

        this.checkedExternalPkData = this.computeCheckedExternalPkData(externalPkData);
        this.mergedExternalPkData = this.computeMergedExternalPkData(this.checkedExternalPkData, this.erweiterteSP);
        this.externalPkDataWithVidisAngebotId = this.computeExternalPkDataWithVidisAngebotId(this.mergedExternalPkData);
        this.vidisDienststellennummern = this.computeVidisDienststellennummern(this.externalPkDataWithVidisAngebotId);

        const uniqueRollenarten: RollenArt[] = this.computeUniqueRollenarten(this.checkedExternalPkData);
        if (uniqueRollenarten.length > 1) {
            return new MultipleRollenartenError(uniqueRollenarten);
        }
        this.singleRollenart = uniqueRollenarten.length === 1 ? uniqueRollenarten[0] : undefined;

        this.polytheaDienststellenNummern = this.computePolytheaDienststellenNummern(this.mergedExternalPkData);

        this.oxParams = this.computeOxParams(this.oxLoginId);

        return undefined;
    }

    private computePolytheaDienststellenNummern(mergedExternalPkData: ExternalPkData[]): string[] {
        const polytheaDienststellenNummern: string[] = mergedExternalPkData
            .filter(
                (pk: ExternalPkData) =>
                    pk.serviceProvider &&
                    pk.serviceProvider.some(
                        // FIX implement better solution to check if the ServiceProvider is a Polythea ServiceProvider
                        (sp: ServiceProvider<true>) => sp.id === POLYTHEA_SERVICE_PROVIDER_ID,
                    ),
            )
            .map((pk: ExternalPkData) => pk.kennung)
            .filter((kennung: string | undefined): kennung is string => kennung !== undefined);
        new Set(polytheaDienststellenNummern).entries();
        return Array.from(new Set(polytheaDienststellenNummern));
    }

    // Filtering out !expk.kennung || !expk.rollenart automatically leads to only valid organisations of type SCHOOLS are included
    // Additionally If there is an data-invalidity the Endpoint still works (If throwing Errors not) and allows the Keycloak the get the data for the other Personenkontexte
    private computeCheckedExternalPkData(externalPkData: ExternalPkData[]): RequiredExternalPkData[] {
        return externalPkData
            .map((expk: ExternalPkData) => {
                if (expk.pkId && expk.kennung && expk.rollenart && expk.serviceProvider) {
                    return {
                        pkId: expk.pkId,
                        rolleId: expk.rolleId,
                        rollenart: expk.rollenart,
                        serviceProvider: expk.serviceProvider,
                        kennung: expk.kennung,
                    } satisfies RequiredExternalPkData;
                }
                return undefined;
            })
            .filter((item: RequiredExternalPkData | undefined): item is RequiredExternalPkData => item !== undefined);
    }

    private computeMergedExternalPkData(
        checkedExternalPkData: RequiredExternalPkData[],
        erweiterteSP: ErweiterterServiceProviderForPK[],
    ): RequiredExternalPkData[] {
        const erweiterungenMap: Map<string, ServiceProvider<true>[]> = new Map<string, ServiceProvider<true>[]>();
        for (const erweiterung of erweiterteSP) {
            const pkId: string = erweiterung.personenkontext.id;
            const sp: ServiceProvider<true> = erweiterung.serviceProvider;
            if (!erweiterungenMap.has(pkId)) {
                erweiterungenMap.set(pkId, []);
            }
            erweiterungenMap.get(pkId)?.push(sp);
        }

        return checkedExternalPkData.map((pk: RequiredExternalPkData) => {
            const extraSp: ServiceProvider<true>[] = erweiterungenMap.get(pk.pkId) ?? [];
            const mergedSp: ServiceProvider<true>[] = [...pk.serviceProvider, ...extraSp];
            const uniqueSp: ServiceProvider<true>[] = uniqBy(mergedSp, 'id');

            return {
                ...pk,
                serviceProvider: uniqueSp,
            };
        });
    }

    private computeExternalPkDataWithVidisAngebotId(
        mergedExternalPkData: RequiredExternalPkData[],
    ): RequiredExternalPkData[] {
        return mergedExternalPkData.filter((pk: RequiredExternalPkData): pk is RequiredExternalPkData =>
            pk.serviceProvider.some((sp: ServiceProvider<true>) => Boolean(sp.vidisAngebotId)),
        );
    }

    private computeVidisDienststellennummern(externalPkDataWithVidisAngebotId: RequiredExternalPkData[]): string[] {
        return uniq(externalPkDataWithVidisAngebotId.map((pk: RequiredExternalPkData) => pk.kennung).filter(Boolean));
    }

    private computeUniqueRollenarten(checkedExternalPkData: RequiredExternalPkData[]): RollenArt[] {
        return uniq(checkedExternalPkData.map((pk: RequiredExternalPkData) => pk.rollenart));
    }

    private computeOxParams(oxLoginId: string | undefined): OxParams | undefined {
        if (oxLoginId) {
            return { oxLoginId };
        }
        return undefined;
    }
}
