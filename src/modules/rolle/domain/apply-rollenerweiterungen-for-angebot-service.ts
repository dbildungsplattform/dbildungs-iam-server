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
import { ApplyRollenerweiterungBodyParams } from '../api/apply-rollenerweiterung.body.params.js';
import { ApplyRollenerweiterungError } from '../api/apply-rollenerweiterung.error.js';
import { Injectable } from '@nestjs/common';
import { RollenSystemRecht } from './systemrecht.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { ServiceProviderMerkmal } from '../../service-provider/domain/service-provider.enum.js';
import { MissingMerkmalVerfuegbarFuerRollenerweiterungError } from './missing-merkmal-verfuegbar-fuer-rollenerweiterung.error.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { RollenMerkmal } from './rolle.enums.js';
import { ErrorIdType } from '../api/ErrorIdType.enum.js';
import { RollenartNotAllowedForSPError } from './rollenart-not-allowed-for-sp.error.js';

type TunknownResultForAngebot = {
    rolleId: string;
    errorIdType: ErrorIdType.ANGEBOT;
    result: Result<unknown, DomainError>;
};

type TerrorResultForAngebot = {
    rolleId: string;
    errorIdType: ErrorIdType.ANGEBOT;
    result: {
        ok: false;
        error: DomainError;
    };
};

function isErrorResultForRolle<T>(r: { result: Result<T, DomainError> }): r is TerrorResultForAngebot {
    return r.result.ok === false;
}

@Injectable()
export class ApplyRollenerweiterungForAngebotService {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly organisationRepo: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
    ) {}

    public async applyRollenerweiterungChangesForAngebot(
        orgaId: string,
        angebotId: string,
        body: ApplyRollenerweiterungBodyParams,
        permissions: IPersonPermissions,
    ): Promise<
        Result<
            null,
            | ApplyRollenerweiterungError
            | EntityNotFoundError
            | MissingPermissionsError
            | MissingMerkmalVerfuegbarFuerRollenerweiterungError
        >
    > {
        if (!(await permissions.hasSystemrechtAtOrganisation(orgaId, RollenSystemRecht.ROLLEN_ERWEITERN))) {
            return Err(new MissingPermissionsError('Not authorized'));
        }
        const hasSystemrechtAtOrganisationMpt: boolean = await permissions.hasSystemrechtAtOrganisation(
            orgaId,
            RollenSystemRecht.MPT_ROLLEN_VERWALTEN,
        );
        const serviceProvider: Option<ServiceProvider<true>> = await this.serviceProviderRepo.findById(angebotId);
        const organisation: Option<Organisation<true>> = await this.organisationRepo.findById(orgaId);
        if (!organisation) {
            this.logger.error(
                `applyRollenerweiterungChanges called by ${permissions.personFields.username} - ${permissions.personFields.id} for not existing organisation ${orgaId}`,
            );
            return Err(new EntityNotFoundError('Orga', orgaId));
        }
        if (!serviceProvider) {
            this.logger.error(
                `applyRollenerweiterungChanges called by ${permissions.personFields.username} - ${permissions.personFields.id} for not existing angebot ${angebotId}`,
            );
            return Err(new EntityNotFoundError('Angebot', angebotId));
        }

        if (!serviceProvider.merkmale.includes(ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG)) {
            this.logger.error(
                `applyRollenerweiterungChanges called by ${permissions.personFields.username} - ${permissions.personFields.id} for existing angebot ${angebotId} which is not verfuegbar for rollenerweiterung`,
            );
            return Err(new MissingMerkmalVerfuegbarFuerRollenerweiterungError());
        }

        const existingErweiterungen: Rollenerweiterung<true>[] =
            await this.rollenerweiterungRepo.findManyByOrganisationIdAndServiceProviderId(orgaId, angebotId);
        const rollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(
            uniq([...body.addErweiterungenForRolleIds, ...body.removeErweiterungenForRolleIds]),
        );
        const [addResults, removeResults]: [TunknownResultForAngebot[], TunknownResultForAngebot[]] = await Promise.all(
            [
                Promise.all(
                    this.handleAddErweiterungen(
                        orgaId,
                        serviceProvider,
                        existingErweiterungen,
                        body.addErweiterungenForRolleIds,
                        rollen,
                        permissions,
                        hasSystemrechtAtOrganisationMpt,
                    ),
                ),
                Promise.all(
                    this.handleRemoveErweiterungen(
                        orgaId,
                        angebotId,
                        existingErweiterungen,
                        body.removeErweiterungenForRolleIds,
                        rollen,
                        hasSystemrechtAtOrganisationMpt,
                    ),
                ),
            ],
        );
        const results: TunknownResultForAngebot[] = [...addResults, ...removeResults];
        const errors: TerrorResultForAngebot[] = results.filter(isErrorResultForRolle);

        if (errors.length > 0) {
            return Err(
                new ApplyRollenerweiterungError(
                    errors.map((e: TerrorResultForAngebot) => ({
                        id: e.rolleId,
                        errorIdType: e.errorIdType,
                        error: e.result.error,
                    })),
                ),
            );
        }
        return Ok(null);
    }

    private handleRemoveErweiterungen(
        orgaId: string,
        angebotId: string,
        existingErweiterungen: Array<Rollenerweiterung<true>> = [],
        removeErweiterungenForRolleIds: string[],
        rollen: Map<string, Rolle<true>>,
        hasSystemrechtAtOrganisationMpt: boolean,
    ): Promise<TunknownResultForAngebot>[] {
        const removeErweiterungenPromises: Promise<TunknownResultForAngebot>[] = removeErweiterungenForRolleIds
            .filter((rolleId: string) => {
                return existingErweiterungen.some((re: Rollenerweiterung<true>) => re.rolleId === rolleId);
            })
            .map((rolleId: string) => {
                const rolle: Option<Rolle<true>> = rollen.get(rolleId);
                this.logger.info(
                    `Removing Erweiterung for rolleId: ${rolleId}, orgaId: ${orgaId}, angebotId: ${angebotId}`,
                );
                if (!rolle) {
                    return Promise.resolve({
                        rolleId,
                        errorIdType: ErrorIdType.ANGEBOT,
                        result: Err(new EntityNotFoundError('Rolle', rolleId)),
                    });
                }
                if (rolle.merkmale.includes(RollenMerkmal.MPT_ROLLE) && !hasSystemrechtAtOrganisationMpt) {
                    return Promise.resolve({
                        rolleId,
                        errorIdType: ErrorIdType.ANGEBOT,
                        result: Err(new MissingPermissionsError('Not authorized')),
                    });
                }
                return this.rollenerweiterungRepo
                    .deleteByComposedId({
                        organisationId: orgaId,
                        rolleId: rolleId,
                        serviceProviderId: angebotId,
                    })
                    .then((result: Result<null, DomainError>) => ({
                        rolleId,
                        errorIdType: ErrorIdType.ANGEBOT,
                        result,
                    }));
            });
        return removeErweiterungenPromises;
    }

    private handleAddErweiterungen(
        orgaId: string,
        serviceProvider: ServiceProvider<true>,
        existingErweiterungen: Array<Rollenerweiterung<true>> = [],
        addErweiterungenForRolleIds: string[],
        rollen: Map<string, Rolle<true>>,
        permissions: IPersonPermissions,
        hasSystemrechtAtOrganisationMpt: boolean,
    ): Promise<TunknownResultForAngebot>[] {
        const erweiterungenPromises: Promise<TunknownResultForAngebot>[] = addErweiterungenForRolleIds
            .filter((rolleId: string) => {
                return existingErweiterungen.findIndex((re: Rollenerweiterung<true>) => re.rolleId === rolleId) === -1;
            })
            .map((rolleId: string) => {
                const rolle: Option<Rolle<true>> = rollen.get(rolleId);
                this.logger.info(
                    `Adding Erweiterung for for rolleId: ${rolleId}, orgaId: ${orgaId}, angebotId: ${serviceProvider.id}`,
                );
                if (!rolle) {
                    return Promise.resolve({
                        rolleId,
                        errorIdType: ErrorIdType.ANGEBOT,
                        result: Err(new EntityNotFoundError('Rolle', rolleId)),
                    });
                }
                if (!serviceProvider.rollenartenWhitelist.includes(rolle.rollenart)) {
                    return Promise.resolve({
                        rolleId,
                        errorIdType: ErrorIdType.ANGEBOT,
                        result: Err(new RollenartNotAllowedForSPError(rolle.rollenart, serviceProvider.id)),
                    });
                }
                if (rolle.merkmale.includes(RollenMerkmal.MPT_ROLLE) && !hasSystemrechtAtOrganisationMpt) {
                    return Promise.resolve({
                        rolleId,
                        errorIdType: ErrorIdType.ANGEBOT,
                        result: Err(new MissingPermissionsError('Not authorized')),
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
                            serviceProvider.id,
                        ),
                        permissions,
                    )
                    .then((result: Result<Rollenerweiterung<true>, DomainError>) => ({
                        rolleId,
                        errorIdType: ErrorIdType.ANGEBOT,
                        result,
                    }));
            });
        return erweiterungenPromises;
    }
}
