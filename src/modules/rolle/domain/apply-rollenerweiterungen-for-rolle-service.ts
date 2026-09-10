import { ClassLogger } from '../../../core/logging/class-logger.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { uniq } from 'lodash-es';
import { Rolle } from './rolle.js';
import { RollenerweiterungRepo } from '../repo/rollenerweiterung.repo.js';
import { Rollenerweiterung } from './rollenerweiterung.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { Injectable } from '@nestjs/common';
import { RollenSystemRecht } from './systemrecht.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { MissingMerkmalVerfuegbarFuerRollenerweiterungError } from './missing-merkmal-verfuegbar-fuer-rollenerweiterung.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ApplyRollenerweiterungChangesBodyParams } from '../api/apply-rollenerweiterung-changes.body.params.js';
import { ApplyRollenerweiterungError } from '../api/apply-rollenerweiterung.error.js';
import { ErrorIdType } from '../api/ErrorIdType.enum.js';
import { RollenMerkmal } from './rolle.enums.js';

type TunknownResultForRolle = {
    serviceProviderId: string;
    errorIdType: ErrorIdType.ROLLE;
    result: Result<unknown, DomainError>;
};

type TerrorResultForRolle = {
    serviceProviderId: string;
    errorIdType: ErrorIdType.ROLLE;
    result: {
        ok: false;
        error: DomainError;
    };
};

function isErrorResultForServiceProvider<T>(r: { result: Result<T, DomainError> }): r is TerrorResultForRolle {
    return r.result.ok === false;
}

@Injectable()
export class ApplyRollenerweiterungForRolleService {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly organisationRepo: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
    ) {}

    public async applyRollenerweiterungChangesForRolle(
        orgaId: string,
        rolleId: string,
        body: ApplyRollenerweiterungChangesBodyParams,
        permissions: IPersonPermissions,
    ): Promise<Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError>> {
        if (!(await permissions.hasSystemrechtAtOrganisation(orgaId, RollenSystemRecht.ROLLEN_ERWEITERN))) {
            return Err(new MissingPermissionsError('Not authorized'));
        }
        const hasSystemrechtAtOrganisationMpt: boolean = await permissions.hasSystemrechtAtOrganisation(
            orgaId,
            RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
        );

        const organisation: Option<Organisation<true>> = await this.organisationRepo.findById(orgaId);
        if (!organisation) {
            this.logger.error(
                `applyRollenerweiterungChangesForRolle called by ${permissions.personFields.username} - ${permissions.personFields.id} for not existing organisation ${orgaId}`,
            );
            return Err(new EntityNotFoundError('Orga', orgaId));
        }

        const rollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds([rolleId]);
        const rolle: Option<Rolle<true>> = rollen.get(rolleId);

        if (!rolle) {
            this.logger.error(
                `applyRollenerweiterungChangesForRolle called by ${permissions.personFields.username} - ${permissions.personFields.id} for not existing rolle ${rolleId}`,
            );
            return Err(new EntityNotFoundError('Rolle', rolleId));
        }
        if (rolle.merkmale.includes(RollenMerkmal.MPT_ROLLE) && !hasSystemrechtAtOrganisationMpt) {
            return Err(new MissingPermissionsError('Not authorized'));
        }

        const existingErweiterungen: Rollenerweiterung<true>[] =
            await this.rollenerweiterungRepo.findManyByOrganisationAndRolle([
                {
                    organisationId: orgaId,
                    rolleId,
                },
            ]);

        const serviceProviders: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            uniq([...body.addErweiterungenForServiceProviderIds, ...body.removeErweiterungenForServiceProviderIds]),
        );

        const [addResults, removeResults]: [TunknownResultForRolle[], TunknownResultForRolle[]] = await Promise.all([
            Promise.all(
                this.handleAddErweiterungen(
                    orgaId,
                    rolleId,
                    existingErweiterungen,
                    body.addErweiterungenForServiceProviderIds,
                    serviceProviders,
                    permissions,
                ),
            ),
            Promise.all(
                this.handleRemoveErweiterungen(
                    orgaId,
                    rolleId,
                    existingErweiterungen,
                    body.removeErweiterungenForServiceProviderIds,
                    serviceProviders,
                ),
            ),
        ]);

        const results: TunknownResultForRolle[] = [...addResults, ...removeResults];
        const errors: TerrorResultForRolle[] = results.filter(isErrorResultForServiceProvider);

        if (errors.length > 0) {
            return Err(
                new ApplyRollenerweiterungError(
                    errors.map((e: TerrorResultForRolle) => ({
                        id: e.serviceProviderId,
                        errorIdType: e.errorIdType,
                        error: e.result.error,
                    })),
                ),
            );
        }

        return Ok(null);
    }

    private handleAddErweiterungen(
        orgaId: string,
        rolleId: string,
        existingErweiterungen: Array<Rollenerweiterung<true>> = [],
        addErweiterungenForServiceProviderIds: string[],
        serviceProviders: Map<string, ServiceProvider<true>>,
        permissions: IPersonPermissions,
    ): Promise<TunknownResultForRolle>[] {
        const erweiterungenPromises: Promise<TunknownResultForRolle>[] = addErweiterungenForServiceProviderIds
            .filter((serviceProviderId: string) => {
                return (
                    existingErweiterungen.findIndex(
                        (re: Rollenerweiterung<true>) => re.serviceProviderId === serviceProviderId,
                    ) === -1
                );
            })
            .map((serviceProviderId: string) => {
                const serviceProvider: Option<ServiceProvider<true>> = serviceProviders.get(serviceProviderId);

                this.logger.info(
                    `Adding Erweiterung for serviceProviderId: ${serviceProviderId}, orgaId: ${orgaId}, rolleId: ${rolleId}`,
                );

                if (!serviceProvider) {
                    return Promise.resolve({
                        serviceProviderId,
                        errorIdType: ErrorIdType.ROLLE,
                        result: Err(new EntityNotFoundError('ServiceProvider', serviceProviderId)),
                    });
                }

                if (!serviceProvider.merkmale.includes(ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG)) {
                    return Promise.resolve({
                        serviceProviderId,
                        errorIdType: ErrorIdType.ROLLE,
                        result: Err(new MissingMerkmalVerfuegbarFuerRollenerweiterungError()),
                    });
                }

                return this.rollenerweiterungRepo
                    .createAuthorized(
                        Rollenerweiterung.createNew(
                            this.organisationRepo,
                            this.rolleRepo,
                            this.serviceProviderRepo,
                            orgaId,
                            rolleId,
                            serviceProviderId,
                        ),
                        permissions,
                    )
                    .then((result: Result<Rollenerweiterung<true>, DomainError>) => ({
                        serviceProviderId,
                        errorIdType: ErrorIdType.ROLLE,
                        result,
                    }));
            });

        return erweiterungenPromises;
    }

    private handleRemoveErweiterungen(
        orgaId: string,
        rolleId: string,
        existingErweiterungen: Array<Rollenerweiterung<true>> = [],
        removeErweiterungenForServiceProviderIds: string[],
        serviceProviders: Map<string, ServiceProvider<true>>,
    ): Promise<TunknownResultForRolle>[] {
        const removeErweiterungenPromises: Promise<TunknownResultForRolle>[] = removeErweiterungenForServiceProviderIds
            .filter((serviceProviderId: string) => {
                return existingErweiterungen.some(
                    (re: Rollenerweiterung<true>) => re.serviceProviderId === serviceProviderId,
                );
            })
            .map((serviceProviderId: string) => {
                const serviceProvider: Option<ServiceProvider<true>> = serviceProviders.get(serviceProviderId);

                this.logger.info(
                    `Removing Erweiterung for serviceProviderId: ${serviceProviderId}, orgaId: ${orgaId}, rolleId: ${rolleId}`,
                );

                if (!serviceProvider) {
                    return Promise.resolve({
                        serviceProviderId,
                        errorIdType: ErrorIdType.ROLLE,
                        result: Err(new EntityNotFoundError('ServiceProvider', serviceProviderId)),
                    });
                }

                return this.rollenerweiterungRepo
                    .deleteByComposedId({
                        organisationId: orgaId,
                        rolleId,
                        serviceProviderId,
                    })
                    .then((result: Result<null, DomainError>) => ({
                        serviceProviderId,
                        errorIdType: ErrorIdType.ROLLE,
                        result,
                    }));
            });

        return removeErweiterungenPromises;
    }
}
