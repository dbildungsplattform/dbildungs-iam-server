import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ServerConfig, VidisConfig } from '../../../shared/config/index.js';
import {
    DomainError,
    EntityNotFoundError,
    MissingAttributeError,
    MissingPermissionsError,
    SharedDomainError,
} from '../../../shared/error/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ScopeOrder } from '../../../shared/persistence/index.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { OrganisationScope } from '../../organisation/persistence/organisation.scope.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { RollenSystemRecht, RollenSystemRechtEnum } from '../../rolle/domain/systemrecht.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderModificationService } from '../../service-provider/domain/service-provider-modification.service.js';
import {
    ServiceProviderKategorie,
    ServiceProviderMerkmal,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { VidisApiAdapter } from '../adapter/domain/vidis-api.adapter.js';
import type {
    VidisAngebotWithSchoolActivations,
    VidisApiResponseAngebotBySchool,
    VidisServiceResponseAngebot,
    VidisServiceResponseSchoolActivation,
} from '../adapter/domain/vidis.types.js';
import { VidisApiError } from '../error/vidis-api.error.js';

type VidisSchoolActivatedAngebot = {
    angebot: VidisServiceResponseAngebot;
    date: string;
};

type VidisAngeboteByOrganisationId = Record<string, VidisSchoolActivatedAngebot[]>;
type VidisOrganisationIdByKennung = Record<string, string>;
type DecodedVidisLogo = {
    logo: Buffer | undefined;
    logoMimeType: string | undefined;
};
type CreateVidisServiceProviderResult = Result<ServiceProvider<true>, DomainError>;
type DeleteVidisServiceProviderResult = Result<void, EntityNotFoundError | MissingPermissionsError>;
type NeedsDbAngebotUpdateResult = {
    needUpdate: boolean;
    isNameChanged: boolean;
    isUrlChanged: boolean;
    isLogoChanged: boolean;
};

@Injectable()
export class VidisSyncService {
    private static readonly PNG_FILE_SIGNATURE: Buffer = Buffer.from('89504e470d0a1a0a', 'hex');
    private static readonly JPEG_FILE_SIGNATURE: Buffer = Buffer.from('ffd8ff', 'hex');
    private static readonly WEBP_RIFF_SIGNATURE: Buffer = Buffer.from('RIFF');
    private static readonly WEBP_FILE_SIGNATURE: Buffer = Buffer.from('WEBP');
    private static readonly DEFAULT_VIDIS_SERVICE_PROVIDER_MERKMALE: ServiceProviderMerkmal[] = [
        ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
        ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR,
        ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
        ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
    ];

    private readonly vidisConfig: VidisConfig;

    public constructor(
        private readonly vidisApiAdapter: VidisApiAdapter,
        private readonly organisationRepo: OrganisationRepository,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly serviceProviderModificationService: ServiceProviderModificationService,
        private readonly escalatedPersonPermissionsFactory: EscalatedPersonPermissionsFactory,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
        private readonly em: EntityManager,
        private readonly logger: ClassLogger,
        configService: ConfigService<ServerConfig>,
    ) {
        this.vidisConfig = configService.getOrThrow<VidisConfig>('VIDIS');
    }

    public async sync(): Promise<void> {
        const activatedAngebote: Result<VidisAngebotWithSchoolActivations[], VidisApiError> =
            await this.vidisApiAdapter.getActivatedAngeboteByRegionSH();

        const nonSchoolProvidedVidisAngebote: ServiceProvider<true>[] =
            await this.serviceProviderRepo.findNonSchoolProvidedVidisAngebote();

        if (!activatedAngebote.ok) {
            this.logger.error('Skipping VIDIS sync because loading activated Angebote failed');
            return;
        }

        const permissions: IPersonPermissions = this.escalatedPersonPermissionsFactory.createNew([
            {
                orgaId: 'ROOT',
                systemrechte: [RollenSystemRechtEnum.ANGEBOTE_VERWALTEN, RollenSystemRechtEnum.ROLLEN_ERWEITERN],
            },
        ]);

        await this.syncSchoolsPage(activatedAngebote.value, 0, nonSchoolProvidedVidisAngebote, permissions);
        this.logger.info('VIDIS sync completed successfully');
    }

    public async syncAngeboteForSchool(
        organisationId: string,
        permissions: IPersonPermissions,
    ): Promise<Result<void, SharedDomainError>> {
        const hasRequiredPermissions: boolean = await permissions.hasSystemrechteAtOrganisation(organisationId, [
            RollenSystemRecht.SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN,
        ]);
        if (!hasRequiredPermissions) {
            return Err(
                new MissingPermissionsError(
                    'Systemrecht SCHULISCHE_VIDIS_ANGEBOTE_ABRUFEN required for this endpoint.',
                ),
            );
        }
        const escalatedPermissions: IPersonPermissions = await this.escalatedPersonPermissionsFactory.fromPermissions(
            permissions,
            [
                {
                    orgaId: organisationId,
                    systemrechte: [RollenSystemRechtEnum.ANGEBOTE_VERWALTEN, RollenSystemRechtEnum.ROLLEN_ERWEITERN],
                },
            ],
        );

        const school: Option<Organisation<true>> = await this.organisationRepo.findById(organisationId);
        if (!school) {
            return Err(new EntityNotFoundError('Organisation', organisationId));
        }

        if (!school.kennung) {
            return Err(new MissingAttributeError('Organisation is missing Kennung required for VIDIS sync.'));
        }

        const activatedAngebote: Result<VidisServiceResponseAngebot[], VidisApiError> =
            await this.vidisApiAdapter.getActivatedAngeboteBySchool(school.kennung);
        if (!activatedAngebote.ok) {
            this.logger.error(
                `Skipping VIDIS sync for school with organisationId ${organisationId} because loading activated Angebote failed`,
            );
            return Err(activatedAngebote.error);
        }

        const nonSchoolProvidedVidisAngebote: ServiceProvider<true>[] =
            await this.serviceProviderRepo.findNonSchoolProvidedVidisAngebote();

        const vidisAngeboteForSchool: ServiceProvider<true>[] =
            await this.serviceProviderRepo.findVidisAngeboteforSchools([organisationId], { withLogo: true });

        await this.syncForSchoolInternal(
            organisationId,
            activatedAngebote.value,
            vidisAngeboteForSchool,
            nonSchoolProvidedVidisAngebote,
            escalatedPermissions,
        );

        return Ok(undefined);
    }

    // Process schools in configurable-pages to keep query results and in-memory sync payloads bounded.
    // This lets us tune sync performance for larger data sets without shipping a new release.
    private async syncSchoolsPage(
        activatedAngebote: VidisAngebotWithSchoolActivations[],
        schoolOffset: number,
        nonSchoolProvidedVidisAngebote: ServiceProvider<true>[],
        permissions: IPersonPermissions,
    ): Promise<void> {
        const [schools, total]: Counted<Organisation<true>> = await this.organisationRepo.findBy(
            new OrganisationScope()
                .findBy({
                    typ: 'SCHULE',
                })
                .sortBy('id', ScopeOrder.ASC)
                .paged(schoolOffset, this.vidisConfig.SYNC_SCHOOLS_PAGE_SIZE),
        );

        if (schools.length === 0) {
            return;
        }

        const nextSchoolOffset: number = schoolOffset + this.vidisConfig.SYNC_SCHOOLS_PAGE_SIZE;
        try {
            const organisationIdByKennung: VidisOrganisationIdByKennung = this.mapOrganisationIdsByKennung(schools);
            const angeboteByOrganisationId: VidisAngeboteByOrganisationId = this.groupAngeboteByOrganisationId(
                activatedAngebote,
                organisationIdByKennung,
            );
            const vidisAngeboteForSchools: ServiceProvider<true>[] =
                await this.serviceProviderRepo.findVidisAngeboteforSchools(Object.values(organisationIdByKennung), {
                    withLogo: true,
                });

            await Promise.all(
                Object.values(organisationIdByKennung).map((organisationId: string) => {
                    const angebote: VidisApiResponseAngebotBySchool[] = (
                        angeboteByOrganisationId[organisationId] ?? []
                    ).map((a: VidisSchoolActivatedAngebot) => a.angebot);
                    return this.syncForSchoolInternal(
                        organisationId,
                        angebote,
                        vidisAngeboteForSchools.filter(
                            (sp: ServiceProvider<true>) => sp.providedOnSchulstrukturknoten === organisationId,
                        ),
                        nonSchoolProvidedVidisAngebote,
                        permissions,
                    );
                }),
            );
        } finally {
            this.em.clear();
        }

        if (nextSchoolOffset >= total) {
            return;
        }

        return this.syncSchoolsPage(activatedAngebote, nextSchoolOffset, nonSchoolProvidedVidisAngebote, permissions);
    }

    private async syncForSchoolInternal(
        organisationId: string,
        angeboteInVidis: VidisApiResponseAngebotBySchool[],
        angeboteInDb: ServiceProvider<true>[],
        nonSchoolProvidedVidisAngeboteInDB: ServiceProvider<true>[], //e.g. for offers provided by Land SH
        permissions: IPersonPermissions,
    ): Promise<void> {
        this.logger.info(`Syncing VIDIS Angebote for school with organisationId: ${organisationId}`);
        const nonSchoolProvidedVidisAngeboteIdsInDB: Set<string> = new Set(
            nonSchoolProvidedVidisAngeboteInDB
                .map((sp: ServiceProvider<true>) => sp.vidisAngebotId)
                .filter((id: string | undefined): id is string => id !== undefined),
        );
        const vidisAngebotIds: Set<string> = new Set(
            angeboteInVidis.map((angebot: VidisApiResponseAngebotBySchool) => angebot.offerId.toString()),
        );

        const existingVidisAngebotIdsInDb: Set<string> = new Set(
            angeboteInDb
                .map((angebotInDb: ServiceProvider<true>) => angebotInDb.vidisAngebotId)
                .filter((vidisAngebotId: string | undefined): vidisAngebotId is string => vidisAngebotId !== undefined),
        );

        const missingAngeboteInDb: VidisApiResponseAngebotBySchool[] = angeboteInVidis.filter(
            (angebot: VidisApiResponseAngebotBySchool) =>
                !nonSchoolProvidedVidisAngeboteIdsInDB.has(angebot.offerId.toString()) &&
                !existingVidisAngebotIdsInDb.has(angebot.offerId.toString()),
        );
        const serviceProviderIdsMissingInVidis: string[] = angeboteInDb
            .filter(
                (angebotInDb: ServiceProvider<true>) =>
                    angebotInDb.vidisAngebotId !== undefined && !vidisAngebotIds.has(angebotInDb.vidisAngebotId),
            )
            .map((angebotInDb: ServiceProvider<true>) => angebotInDb.id);
        const hasAngeboteNeedingUpdate: boolean = angeboteInDb.some((angebotInDb: ServiceProvider<true>) => {
            const matchingAngebotInVidis: VidisApiResponseAngebotBySchool | undefined = angeboteInVidis.find(
                (angebot: VidisApiResponseAngebotBySchool) => angebot.offerId.toString() === angebotInDb.vidisAngebotId,
            );

            return matchingAngebotInVidis != null
                ? this.needsDbAngebotUpdate(angebotInDb, matchingAngebotInVidis).needUpdate
                : false;
        });

        if (
            missingAngeboteInDb.length === 0 &&
            serviceProviderIdsMissingInVidis.length === 0 &&
            !hasAngeboteNeedingUpdate
        ) {
            this.logger.info(
                `No differences between VIDIS API and database for school with organisationId: ${organisationId}`,
            );
            return;
        }
        this.logger.info(
            `Differences found between VIDIS API and database for school with organisationId: ${organisationId}. ` +
                `VIDIS Angebote to add to DB: [${missingAngeboteInDb
                    .map(
                        (angebot: VidisApiResponseAngebotBySchool) =>
                            `${angebot.offerId} (${angebot.offerTitle.toString().substring(0, 50)})`,
                    )
                    .join(', ')}]. ` +
                `VIDIS Angebote to remove from DB: [${angeboteInDb
                    .filter(
                        (angebotInDb: ServiceProvider<true>) =>
                            angebotInDb.vidisAngebotId !== undefined &&
                            !vidisAngebotIds.has(angebotInDb.vidisAngebotId),
                    )
                    .map(
                        (angebotInDb: ServiceProvider<true>) =>
                            `${angebotInDb.vidisAngebotId} (${angebotInDb.name.substring(0, 50)})`,
                    )
                    .join(', ')}]`,
        );

        const createOperations: Promise<CreateVidisServiceProviderResult>[] = missingAngeboteInDb.map(
            (angebot: VidisApiResponseAngebotBySchool) =>
                this.serviceProviderModificationService.create(
                    permissions,
                    this.createVidisServiceProvider(organisationId, angebot),
                ),
        );
        const syncOperations: Promise<unknown>[] = [...createOperations];
        const deleteOperationsByServiceProviderId: Map<string, Promise<DeleteVidisServiceProviderResult>> = new Map();

        if (serviceProviderIdsMissingInVidis.length > 0) {
            try {
                const deleteRollenerweiterungenResult: Awaited<
                    ReturnType<RollenerweiterungRepo['deleteByOrganisationIdAndServiceProviderIds']>
                > = await this.rollenerweiterungRepo.deleteByOrganisationIdAndServiceProviderIds(
                    organisationId,
                    serviceProviderIdsMissingInVidis,
                    permissions,
                );
                if (deleteRollenerweiterungenResult.ok) {
                    serviceProviderIdsMissingInVidis.forEach((serviceProviderId: string) => {
                        const deleteOperation: Promise<DeleteVidisServiceProviderResult> =
                            this.serviceProviderRepo.deleteByIdAuthorized(permissions, serviceProviderId);
                        deleteOperationsByServiceProviderId.set(serviceProviderId, deleteOperation);
                        syncOperations.push(deleteOperation);
                    });
                } else {
                    syncOperations.push(Promise.reject(deleteRollenerweiterungenResult.error));
                }
            } catch (error) {
                const rejectionReason: Error = error instanceof Error ? error : new Error(String(error));
                syncOperations.push(Promise.reject(rejectionReason));
            }
        }

        const results: PromiseSettledResult<unknown>[] = await Promise.allSettled(syncOperations);
        const failedOperations: PromiseSettledResult<unknown>[] = results.filter(
            (result: PromiseSettledResult<unknown>) =>
                result.status === 'rejected' ||
                (result.status === 'fulfilled' &&
                    typeof result.value === 'object' &&
                    result.value !== null &&
                    'ok' in result.value &&
                    result.value.ok === false),
        );

        if (failedOperations.length > 0) {
            this.logger.error(
                `VIDIS sync for organisation ${organisationId} finished with ${failedOperations.length} failed operations.`,
            );

            failedOperations.forEach((result: PromiseSettledResult<unknown>) => {
                if (result.status === 'rejected') {
                    this.logger.logUnknownAsError(
                        `VIDIS sync operation for organisation ${organisationId} rejected`,
                        result.reason,
                    );
                    return;
                }

                const failedResult: unknown = result.value;
                const error: unknown =
                    typeof failedResult === 'object' && failedResult !== null && 'error' in failedResult
                        ? failedResult.error
                        : failedResult;

                this.logger.logUnknownAsError(
                    `VIDIS sync operation for organisation ${organisationId} returned an error result`,
                    error,
                    false,
                );
            });
        }

        const createResults: PromiseSettledResult<CreateVidisServiceProviderResult>[] =
            await Promise.allSettled(createOperations);
        const successfullyCreatedAngebote: ServiceProvider<true>[] = [];

        createResults.forEach((result: PromiseSettledResult<CreateVidisServiceProviderResult>) => {
            if (result.status === 'fulfilled' && result.value.ok) {
                successfullyCreatedAngebote.push(result.value.value);
            }
        });

        const successfullyDeletedServiceProviderIds: Set<string> = new Set();
        await Promise.all(
            Array.from(deleteOperationsByServiceProviderId.entries()).map(
                async ([serviceProviderId, deleteOperation]: [string, Promise<DeleteVidisServiceProviderResult>]) => {
                    const [result]: PromiseSettledResult<DeleteVidisServiceProviderResult>[] = await Promise.allSettled(
                        [deleteOperation],
                    );
                    if (
                        result?.status === 'fulfilled' &&
                        typeof result.value === 'object' &&
                        result.value !== null &&
                        'ok' in result.value &&
                        result.value.ok
                    ) {
                        successfullyDeletedServiceProviderIds.add(serviceProviderId);
                    }
                },
            ),
        );

        const angeboteInDbAfterCreateDelete: ServiceProvider<true>[] = [
            ...angeboteInDb.filter(
                (angebotInDb: ServiceProvider<true>) => !successfullyDeletedServiceProviderIds.has(angebotInDb.id),
            ),
            ...successfullyCreatedAngebote,
        ];
        const updateOperations: Promise<void>[] = angeboteInDbAfterCreateDelete.flatMap(
            (angebotInDb: ServiceProvider<true>) => {
                const matchingAngebotInVidis: VidisApiResponseAngebotBySchool | undefined = angeboteInVidis.find(
                    (a: VidisApiResponseAngebotBySchool) => a.offerId.toString() === angebotInDb.vidisAngebotId,
                );
                const needsDbUpdate: NeedsDbAngebotUpdateResult | undefined =
                    matchingAngebotInVidis != null
                        ? this.needsDbAngebotUpdate(angebotInDb, matchingAngebotInVidis)
                        : undefined;

                return matchingAngebotInVidis != null && needsDbUpdate?.needUpdate
                    ? [this.updateAngebotToMatchVidis(needsDbUpdate, angebotInDb, matchingAngebotInVidis, permissions)]
                    : [];
            },
        );

        await Promise.allSettled(updateOperations);
    }

    private async updateAngebotToMatchVidis(
        needsDbUpdate: NeedsDbAngebotUpdateResult,
        angebotInDb: ServiceProvider<true>,
        matchingAngebotInVidis: VidisApiResponseAngebotBySchool,
        permissions: IPersonPermissions,
    ): Promise<void> {
        this.logger.info(
            `Updating VIDIS Angebot with id ${angebotInDb.id} in DB because it differs from VIDIS API. ` +
                `Name changed: ${needsDbUpdate.isNameChanged}${needsDbUpdate.isNameChanged ? ` (before: "${angebotInDb.name}", after: "${matchingAngebotInVidis.offerTitle.toString()}")` : ''}, ` +
                `URL changed: ${needsDbUpdate.isUrlChanged}${needsDbUpdate.isUrlChanged ? ` (before: "${angebotInDb.url}", after: "${matchingAngebotInVidis.offerLink}")` : ''}, ` +
                `Logo changed: ${needsDbUpdate.isLogoChanged}`,
        );
        if (needsDbUpdate.isNameChanged) {
            angebotInDb.name = matchingAngebotInVidis.offerTitle.toString();
        }
        if (needsDbUpdate.isUrlChanged) {
            angebotInDb.url = matchingAngebotInVidis.offerLink;
        }
        if (needsDbUpdate.isLogoChanged) {
            const { logo, logoMimeType }: DecodedVidisLogo = VidisSyncService.decodeVidisLogo(
                matchingAngebotInVidis.offerLogo,
            );
            angebotInDb.logo = logo;
            angebotInDb.logoMimeType = logoMimeType;
        }

        const updateResult: Result<
            ServiceProvider<true>,
            DomainError
        > = await this.serviceProviderModificationService.update(permissions, angebotInDb);
        if (updateResult.ok) {
            this.logger.info(`Successfully updated VIDIS Angebot with id ${angebotInDb.id} in DB`);
        } else {
            this.logger.logUnknownAsError(
                `Failed to update VIDIS Angebot with id ${angebotInDb.id} in DB`,
                updateResult.error,
                false,
            );
        }
    }

    private needsDbAngebotUpdate(
        angebotInDb: ServiceProvider<true>,
        angebotInVidis: VidisServiceResponseAngebot,
    ): NeedsDbAngebotUpdateResult {
        let isNameChanged: boolean = false;
        let isUrlChanged: boolean = false;
        let isLogoChanged: boolean = false;

        if (angebotInDb.name !== angebotInVidis.offerTitle) {
            isNameChanged = true;
        }
        if (angebotInDb.url !== angebotInVidis.offerLink) {
            isUrlChanged = true;
        }

        const { logo, logoMimeType }: DecodedVidisLogo = VidisSyncService.decodeVidisLogo(angebotInVidis.offerLogo);

        if (angebotInDb.logoMimeType !== logoMimeType) {
            isLogoChanged = true;
        }

        if (angebotInDb.logo && logo && !angebotInDb.logo.equals(logo)) {
            isLogoChanged = true;
        }

        return {
            needUpdate: isNameChanged || isUrlChanged || isLogoChanged,
            isNameChanged,
            isUrlChanged,
            isLogoChanged,
        };
    }

    private createVidisServiceProvider(
        organisationId: string,
        angebot: VidisServiceResponseAngebot,
    ): ServiceProvider<false> {
        const { logo, logoMimeType }: DecodedVidisLogo = VidisSyncService.decodeVidisLogo(angebot.offerLogo);

        return ServiceProvider.createNew(
            angebot.offerTitle.toString(),
            ServiceProviderTarget.URL,
            angebot.offerLink,
            ServiceProviderKategorie.SCHULISCH,
            organisationId,
            undefined,
            logo,
            logoMimeType,
            undefined,
            undefined,
            ServiceProviderSystem.NONE,
            false,
            angebot.offerId.toString(),
            VidisSyncService.DEFAULT_VIDIS_SERVICE_PROVIDER_MERKMALE,
            [],
        );
    }

    private static decodeVidisLogo(offerLogo: string): DecodedVidisLogo {
        if (!offerLogo) {
            return { logo: undefined, logoMimeType: undefined };
        }

        const trimmedLogo: string = offerLogo.trim();
        const dataUriMatch: RegExpMatchArray | null = trimmedLogo.match(
            /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,(.+)$/u,
        );
        const encodedLogo: string = dataUriMatch?.[2] ?? trimmedLogo;
        const logo: Buffer = Buffer.from(encodedLogo, 'base64');

        if (logo.length === 0) {
            return { logo: undefined, logoMimeType: undefined };
        }

        const logoMimeType: string | undefined = dataUriMatch?.[1] ?? VidisSyncService.detectLogoMimeType(logo);
        if (!logoMimeType) {
            return { logo: undefined, logoMimeType: undefined };
        }

        return { logo, logoMimeType };
    }

    private static detectLogoMimeType(logo: Buffer): string | undefined {
        if (logo.subarray(0, VidisSyncService.PNG_FILE_SIGNATURE.length).equals(VidisSyncService.PNG_FILE_SIGNATURE)) {
            return 'image/png';
        }

        if (
            logo.subarray(0, VidisSyncService.JPEG_FILE_SIGNATURE.length).equals(VidisSyncService.JPEG_FILE_SIGNATURE)
        ) {
            return 'image/jpeg';
        }

        if (
            logo
                .subarray(0, VidisSyncService.WEBP_RIFF_SIGNATURE.length)
                .equals(VidisSyncService.WEBP_RIFF_SIGNATURE) &&
            logo
                .subarray(8, 8 + VidisSyncService.WEBP_FILE_SIGNATURE.length)
                .equals(VidisSyncService.WEBP_FILE_SIGNATURE)
        ) {
            return 'image/webp';
        }

        const logoAsText: string = logo.toString('utf8').trimStart();
        if (logoAsText.startsWith('<svg') || (logoAsText.startsWith('<?xml') && logoAsText.includes('<svg'))) {
            return 'image/svg+xml';
        }

        return undefined;
    }

    private mapOrganisationIdsByKennung(schools: Organisation<true>[]): VidisOrganisationIdByKennung {
        return schools.reduce((organisationIdByKennung: VidisOrganisationIdByKennung, school: Organisation<true>) => {
            if (school.kennung) {
                organisationIdByKennung[school.kennung] = school.id;
            }

            return organisationIdByKennung;
        }, {});
    }

    private groupAngeboteByOrganisationId(
        activatedAngebote: VidisAngebotWithSchoolActivations[],
        organisationIdByKennung: VidisOrganisationIdByKennung,
    ): VidisAngeboteByOrganisationId {
        const angeboteByOrganisationId: VidisAngeboteByOrganisationId = {};

        activatedAngebote.forEach((angebotWithSchoolActivations: VidisAngebotWithSchoolActivations) => {
            angebotWithSchoolActivations.schoolActivations.forEach(
                (schoolActivation: VidisServiceResponseSchoolActivation) => {
                    const organisationId: string | undefined = organisationIdByKennung[schoolActivation.kennung];
                    if (!organisationId) {
                        return;
                    }

                    const schoolAngebote: VidisSchoolActivatedAngebot[] =
                        angeboteByOrganisationId[organisationId] ?? [];

                    schoolAngebote.push({
                        angebot: angebotWithSchoolActivations.angebot,
                        date: schoolActivation.date,
                    });

                    angeboteByOrganisationId[organisationId] = schoolAngebote;
                },
            );
        });

        return angeboteByOrganisationId;
    }
}
