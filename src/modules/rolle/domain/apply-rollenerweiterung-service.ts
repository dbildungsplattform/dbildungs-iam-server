/* eslint-disable no-await-in-loop */
import { Injectable } from '@nestjs/common';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError, EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/aggregate-ids.types.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { ApplyRollenerweiterungChangesBodyParams } from '../api/apply-rollenerweiterung-changes.body.params.js';
import { ApplyRollenerweiterungBodyParams } from '../api/apply-rollenerweiterung.body.params.js';
import { ApplyRollenerweiterungError } from '../api/apply-rollenerweiterung.error.js';
import { ErrorIdType } from '../api/ErrorIdType.enum.js';
import { RolleRepo } from '../repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../repo/rollenerweiterung.repo.js';
import { RollenMerkmal } from './rolle.enums.js';
import { Rolle } from './rolle.js';
import { CreateRollenerweiterungError, Rollenerweiterung } from './rollenerweiterung.js';
import { RollenSystemRecht } from './systemrecht.js';

interface RollenerweiterungOperationResult {
    id: string;
    errorIdType: ErrorIdType;
    result: Result<unknown, DomainError>;
}

interface RollenerweiterungOperationError {
    id: string;
    errorIdType: ErrorIdType;
    result: {
        ok: false;
        error: DomainError;
    };
}

interface AddRollenerweiterungParams {
    organisation: Organisation<true>;
    rolle: Rolle<true>;
    serviceProvider: ServiceProvider<true>;
    errorId: string;
    errorIdType: ErrorIdType;
}

interface RemoveRollenerweiterungParams {
    organisationId: string;
    rolleId: RolleID;
    serviceProviderId: ServiceProviderID;
    errorId: string;
    errorIdType: ErrorIdType;
}

interface OrganisationAndRolleContext {
    organisation: Organisation<true>;
    rolle: Rolle<true>;
}

interface OrganisationAndServiceProviderContext {
    organisation: Organisation<true>;
    serviceProvider: ServiceProvider<true>;
}

interface CreateRollenerweiterungContext extends OrganisationAndRolleContext {
    serviceProvider: ServiceProvider<true>;
}

type ApplyChangesResult = Result<null, ApplyRollenerweiterungError | EntityNotFoundError | MissingPermissionsError>;

function isErrorResult(
    operationResult: RollenerweiterungOperationResult,
): operationResult is RollenerweiterungOperationError {
    return operationResult.result.ok === false;
}

@Injectable()
export class ApplyRollenerweiterungService {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly serviceProviderRepo: ServiceProviderRepo,
        private readonly organisationRepo: OrganisationRepository,
        private readonly rolleRepo: RolleRepo,
        private readonly rollenerweiterungRepo: RollenerweiterungRepo,
    ) {}

    public async applyRollenerweiterungChangesForRolle(
        organisationId: OrganisationID,
        rolleId: RolleID,
        body: ApplyRollenerweiterungChangesBodyParams,
        permissions: IPersonPermissions,
    ): Promise<ApplyChangesResult> {
        const permissionResult: Result<null, MissingPermissionsError> = await this.checkBasePermission(
            permissions,
            organisationId,
        );
        if (!permissionResult.ok) {
            return permissionResult;
        }

        const contextResult: Result<OrganisationAndRolleContext, EntityNotFoundError> =
            await this.loadOrganisationAndRolle(organisationId, rolleId);
        if (!contextResult.ok) {
            this.logger.error(
                `applyRollenerweiterungChangesForRolle called by ` +
                    `${permissions.personFields.username} - ` +
                    `${permissions.personFields.id}. ` +
                    `Error: ${contextResult.error.message}`,
            );

            return contextResult;
        }
        const { organisation, rolle }: OrganisationAndRolleContext = contextResult.value;

        const mptPermissionResult: Result<null, MissingPermissionsError> = await this.checkMptPermissionForRolle(
            permissions,
            organisationId,
            rolle,
        );
        if (!mptPermissionResult.ok) {
            return mptPermissionResult;
        }

        const existingErweiterungen: Rollenerweiterung<true>[] =
            await this.rollenerweiterungRepo.findManyByOrganisationAndRolle([
                {
                    organisationId,
                    rolleId,
                },
            ]);

        const addServiceProviderIds: ServiceProviderID[] = Array.from(
            new Set(body.addErweiterungenForServiceProviderIds),
        );
        const removeServiceProviderIds: ServiceProviderID[] = Array.from(
            new Set(body.removeErweiterungenForServiceProviderIds),
        );
        const uniqueServiceProviderIds: ServiceProviderID[] = Array.from(
            new Set([...addServiceProviderIds, ...removeServiceProviderIds]),
        );

        const serviceProviders: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            uniqueServiceProviderIds,
        );

        const addResults: RollenerweiterungOperationResult[] = await this.addRollenerweiterungenForRolle(
            organisation,
            rolle,
            addServiceProviderIds,
            serviceProviders,
            existingErweiterungen,
        );

        const removeResults: RollenerweiterungOperationResult[] = await this.removeRollenerweiterungenForRolle(
            organisationId,
            rolleId,
            removeServiceProviderIds,
            serviceProviders,
        );

        return this.combineResults([...addResults, ...removeResults]);
    }

    public async applyRollenerweiterungChangesForAngebot(
        organisationId: OrganisationID,
        angebotId: ServiceProviderID,
        body: ApplyRollenerweiterungBodyParams,
        permissions: IPersonPermissions,
    ): Promise<ApplyChangesResult> {
        const permissionResult: Result<null, MissingPermissionsError> = await this.checkBasePermission(
            permissions,
            organisationId,
        );
        if (!permissionResult.ok) {
            return permissionResult;
        }

        const contextResult: Result<OrganisationAndServiceProviderContext, EntityNotFoundError> =
            await this.loadOrganisationAndServiceProvider(organisationId, angebotId);
        if (!contextResult.ok) {
            this.logger.error(
                `applyRollenerweiterungChangesForAngebot called by ` +
                    `${permissions.personFields.username} - ` +
                    `${permissions.personFields.id}. ` +
                    `Error: ${contextResult.error.message}`,
            );

            return contextResult;
        }
        const { organisation, serviceProvider }: OrganisationAndServiceProviderContext = contextResult.value;

        const existingErweiterungen: Rollenerweiterung<true>[] =
            await this.rollenerweiterungRepo.findManyByOrganisationIdAndServiceProviderId(organisationId, angebotId);

        const addRolleIds: RolleID[] = Array.from(new Set(body.addErweiterungenForRolleIds));
        const removeRolleIds: RolleID[] = Array.from(new Set(body.removeErweiterungenForRolleIds));
        const uniqueRolleIds: RolleID[] = Array.from(new Set([...addRolleIds, ...removeRolleIds]));

        const rollen: Map<string, Rolle<true>> = await this.rolleRepo.findByIds(uniqueRolleIds);

        const hasMptPermission: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
        );

        const addResults: RollenerweiterungOperationResult[] = await this.addRollenerweiterungenForAngebot(
            organisation,
            serviceProvider,
            addRolleIds,
            rollen,
            existingErweiterungen,
            hasMptPermission,
        );

        const removeResults: RollenerweiterungOperationResult[] = await this.removeRollenerweiterungenForAngebot(
            organisationId,
            serviceProvider.id,
            removeRolleIds,
            rollen,
            hasMptPermission,
        );

        return this.combineResults([...addResults, ...removeResults]);
    }

    public async createRollenerweiterung(
        organisationId: OrganisationID,
        rolleId: RolleID,
        serviceProviderId: ServiceProviderID,
        permissions: IPersonPermissions,
    ): Promise<
        Result<Rollenerweiterung<true>, EntityNotFoundError | MissingPermissionsError | CreateRollenerweiterungError>
    > {
        const permissionResult: Result<null, MissingPermissionsError> = await this.checkBasePermission(
            permissions,
            organisationId,
        );
        if (!permissionResult.ok) {
            return permissionResult;
        }

        const contextResult: Result<CreateRollenerweiterungContext, EntityNotFoundError> =
            await this.loadCreateRollenerweiterungContext(organisationId, rolleId, serviceProviderId);
        if (!contextResult.ok) {
            this.logger.error(
                `createRollenerweiterung called by ` +
                    `${permissions.personFields.username} - ` +
                    `${permissions.personFields.id}. ` +
                    `Error: ${contextResult.error.message}`,
            );

            return contextResult;
        }
        const { organisation, rolle, serviceProvider }: CreateRollenerweiterungContext = contextResult.value;

        const mptPermissionResult: Result<null, MissingPermissionsError> = await this.checkMptPermissionForRolle(
            permissions,
            organisationId,
            rolle,
        );
        if (!mptPermissionResult.ok) {
            return mptPermissionResult;
        }

        return this.createAndPersistRollenerweiterung(organisation, rolle, serviceProvider);
    }

    public async findRollenerweiterungenForRolleAndOrganisation(
        organisationId: OrganisationID,
        rolleId: RolleID,
        permissions: IPersonPermissions,
    ): Promise<Result<ServiceProvider<true>[], MissingPermissionsError | EntityNotFoundError>> {
        const permissionResult: Result<null, MissingPermissionsError> = await this.checkBasePermission(
            permissions,
            organisationId,
        );
        if (!permissionResult.ok) {
            return permissionResult;
        }

        const contextResult: Result<OrganisationAndRolleContext, EntityNotFoundError> =
            await this.loadOrganisationAndRolle(organisationId, rolleId);
        if (!contextResult.ok) {
            return contextResult;
        }

        const rollenerweiterungen: Rollenerweiterung<true>[] =
            await this.rollenerweiterungRepo.findManyByOrganisationAndRolle([
                {
                    organisationId,
                    rolleId,
                },
            ]);
        if (rollenerweiterungen.length === 0) {
            return Ok([]);
        }

        const serviceProviderIds: ServiceProviderID[] = Array.from(
            new Set(
                rollenerweiterungen.map(
                    (rollenerweiterung: Rollenerweiterung<true>): ServiceProviderID =>
                        rollenerweiterung.serviceProviderId,
                ),
            ),
        );
        const serviceProviders: Map<string, ServiceProvider<true>> = await this.serviceProviderRepo.findByIds(
            serviceProviderIds,
        );

        return Ok(Array.from(serviceProviders.values()));
    }

    /*
    private functions
    */

    private async loadOrganisationAndRolle(
        organisationId: OrganisationID,
        rolleId: RolleID,
    ): Promise<Result<OrganisationAndRolleContext, EntityNotFoundError>> {
        const [organisation, rollen]: [Option<Organisation<true>>, Map<string, Rolle<true>>] = await Promise.all([
            this.organisationRepo.findById(organisationId),
            this.rolleRepo.findByIds([rolleId]),
        ]);
        if (!organisation) {
            return Err(new EntityNotFoundError('Organisation', organisationId));
        }

        const rolle: Rolle<true> | undefined = rollen.get(rolleId);
        if (!rolle) {
            return Err(new EntityNotFoundError('Rolle', rolleId));
        }

        return Ok({
            organisation,
            rolle,
        });
    }

    private async loadOrganisationAndServiceProvider(
        organisationId: OrganisationID,
        serviceProviderId: ServiceProviderID,
    ): Promise<Result<OrganisationAndServiceProviderContext, EntityNotFoundError>> {
        const [organisation, serviceProvider]: [Option<Organisation<true>>, Option<ServiceProvider<true>>] =
            await Promise.all([
                this.organisationRepo.findById(organisationId),
                this.serviceProviderRepo.findById(serviceProviderId),
            ]);
        if (!organisation) {
            return Err(new EntityNotFoundError('Organisation', organisationId));
        }
        if (!serviceProvider) {
            return Err(new EntityNotFoundError('Angebot', serviceProviderId));
        }

        return Ok({
            organisation,
            serviceProvider,
        });
    }

    private async loadCreateRollenerweiterungContext(
        organisationId: OrganisationID,
        rolleId: RolleID,
        serviceProviderId: ServiceProviderID,
    ): Promise<Result<CreateRollenerweiterungContext, EntityNotFoundError>> {
        const [organisation, rollen, serviceProvider]: [
            Option<Organisation<true>>,
            Map<string, Rolle<true>>,
            Option<ServiceProvider<true>>,
        ] = await Promise.all([
            this.organisationRepo.findById(organisationId),
            this.rolleRepo.findByIds([rolleId]),
            this.serviceProviderRepo.findById(serviceProviderId),
        ]);
        if (!organisation) {
            return Err(new EntityNotFoundError('Orga', organisationId));
        }

        const rolle: Rolle<true> | undefined = rollen.get(rolleId);
        if (!rolle) {
            return Err(new EntityNotFoundError('Rolle', rolleId));
        }
        if (!serviceProvider) {
            return Err(new EntityNotFoundError('ServiceProvider', serviceProviderId));
        }

        return Ok({
            organisation,
            rolle,
            serviceProvider,
        });
    }

    private async createAndPersistRollenerweiterung(
        organisation: Organisation<true>,
        rolle: Rolle<true>,
        serviceProvider: ServiceProvider<true>,
    ): Promise<Result<Rollenerweiterung<true>, CreateRollenerweiterungError>> {
        const createResult: Result<
            Rollenerweiterung<false>,
            CreateRollenerweiterungError
        > = Rollenerweiterung.createNew(organisation.id, rolle, serviceProvider);
        if (!createResult.ok) {
            return createResult;
        }

        const persistedRollenerweiterung: Rollenerweiterung<true> = await this.rollenerweiterungRepo.create(
            createResult.value,
        );

        return Ok(persistedRollenerweiterung);
    }

    private async addRollenerweiterungenForRolle(
        organisation: Organisation<true>,
        rolle: Rolle<true>,
        serviceProviderIds: ServiceProviderID[],
        serviceProviders: Map<string, ServiceProvider<true>>,
        existingErweiterungen: Rollenerweiterung<true>[],
    ): Promise<RollenerweiterungOperationResult[]> {
        const results: RollenerweiterungOperationResult[] = [];

        for (const serviceProviderId of serviceProviderIds) {
            const alreadyExists: boolean = existingErweiterungen.some(
                (rollenerweiterung: Rollenerweiterung<true>) =>
                    rollenerweiterung.serviceProviderId === serviceProviderId,
            );

            /*
             * Applying an already existing Rollenerweiterung is idempotent.
             * The domain-level redundancy error remains relevant for direct
             * creation attempts outside this apply workflow.
             */
            if (alreadyExists) {
                continue;
            }

            const serviceProvider: ServiceProvider<true> | undefined = serviceProviders.get(serviceProviderId);
            if (!serviceProvider) {
                results.push({
                    id: serviceProviderId,
                    errorIdType: ErrorIdType.ROLLE,
                    result: Err(new EntityNotFoundError('ServiceProvider', serviceProviderId)),
                });

                continue;
            }

            this.logger.info(
                `Adding Erweiterung for serviceProviderId: ` +
                    `${serviceProviderId}, orgaId: ` +
                    `${organisation.id}, rolleId: ${rolle.id}`,
            );

            results.push(
                await this.addRollenerweiterung({
                    organisation,
                    rolle,
                    serviceProvider,
                    errorId: serviceProviderId,
                    errorIdType: ErrorIdType.ROLLE,
                }),
            );
        }

        return results;
    }

    private async addRollenerweiterungenForAngebot(
        organisation: Organisation<true>,
        serviceProvider: ServiceProvider<true>,
        rolleIds: RolleID[],
        rollen: Map<string, Rolle<true>>,
        existingErweiterungen: Rollenerweiterung<true>[],
        hasMptPermission: boolean,
    ): Promise<RollenerweiterungOperationResult[]> {
        const results: RollenerweiterungOperationResult[] = [];

        for (const rolleId of rolleIds) {
            const alreadyExists: boolean = existingErweiterungen.some(
                (rollenerweiterung: Rollenerweiterung<true>) => rollenerweiterung.rolleId === rolleId,
            );

            /*
             * Applying an already existing Rollenerweiterung is idempotent.
             * The domain-level redundancy error remains relevant for direct
             * creation attempts outside this apply workflow.
             */
            if (alreadyExists) {
                continue;
            }

            const rolle: Rolle<true> | undefined = rollen.get(rolleId);
            if (!rolle) {
                results.push({
                    id: rolleId,
                    errorIdType: ErrorIdType.ANGEBOT,
                    result: Err(new EntityNotFoundError('Rolle', rolleId)),
                });

                continue;
            }

            if (rolle.merkmale.includes(RollenMerkmal.MPT_ROLLE) && !hasMptPermission) {
                results.push({
                    id: rolleId,
                    errorIdType: ErrorIdType.ANGEBOT,
                    result: Err(new MissingPermissionsError('Not authorized')),
                });

                continue;
            }

            this.logger.info(
                `Adding Erweiterung for rolleId: ${rolleId}, ` +
                    `orgaId: ${organisation.id}, ` +
                    `angebotId: ${serviceProvider.id}`,
            );

            results.push(
                await this.addRollenerweiterung({
                    organisation,
                    rolle,
                    serviceProvider,
                    errorId: rolleId,
                    errorIdType: ErrorIdType.ANGEBOT,
                }),
            );
        }

        return results;
    }

    private async addRollenerweiterung({
        organisation,
        rolle,
        serviceProvider,
        errorId,
        errorIdType,
    }: AddRollenerweiterungParams): Promise<RollenerweiterungOperationResult> {
        const result: Result<
            Rollenerweiterung<true>,
            CreateRollenerweiterungError
        > = await this.createAndPersistRollenerweiterung(organisation, rolle, serviceProvider);

        return {
            id: errorId,
            errorIdType,
            result,
        };
    }

    private async removeRollenerweiterungenForRolle(
        organisationId: string,
        rolleId: string,
        serviceProviderIds: ServiceProviderID[],
        serviceProviders: Map<string, ServiceProvider<true>>,
    ): Promise<RollenerweiterungOperationResult[]> {
        const results: RollenerweiterungOperationResult[] = [];

        for (const serviceProviderId of serviceProviderIds) {
            const serviceProvider: ServiceProvider<true> | undefined = serviceProviders.get(serviceProviderId);
            if (!serviceProvider) {
                results.push({
                    id: serviceProviderId,
                    errorIdType: ErrorIdType.ROLLE,
                    result: Err(new EntityNotFoundError('ServiceProvider', serviceProviderId)),
                });

                continue;
            }

            this.logger.info(
                `Removing Erweiterung for serviceProviderId: ` +
                    `${serviceProviderId}, orgaId: ${organisationId}, ` +
                    `rolleId: ${rolleId}`,
            );

            results.push(
                await this.removeRollenerweiterung({
                    organisationId,
                    rolleId,
                    serviceProviderId,
                    errorId: serviceProviderId,
                    errorIdType: ErrorIdType.ROLLE,
                }),
            );
        }

        return results;
    }

    private async removeRollenerweiterungenForAngebot(
        organisationId: string,
        serviceProviderId: ServiceProviderID,
        rolleIds: RolleID[],
        rollen: Map<string, Rolle<true>>,
        hasMptPermission: boolean,
    ): Promise<RollenerweiterungOperationResult[]> {
        const results: RollenerweiterungOperationResult[] = [];

        for (const rolleId of rolleIds) {
            const rolle: Rolle<true> | undefined = rollen.get(rolleId);
            if (!rolle) {
                results.push({
                    id: rolleId,
                    errorIdType: ErrorIdType.ANGEBOT,
                    result: Err(new EntityNotFoundError('Rolle', rolleId)),
                });

                continue;
            }

            if (rolle.merkmale.includes(RollenMerkmal.MPT_ROLLE) && !hasMptPermission) {
                results.push({
                    id: rolleId,
                    errorIdType: ErrorIdType.ANGEBOT,
                    result: Err(new MissingPermissionsError('Not authorized')),
                });

                continue;
            }

            this.logger.info(
                `Removing Erweiterung for rolleId: ${rolleId}, ` +
                    `orgaId: ${organisationId}, ` +
                    `angebotId: ${serviceProviderId}`,
            );

            results.push(
                await this.removeRollenerweiterung({
                    organisationId,
                    rolleId,
                    serviceProviderId,
                    errorId: rolleId,
                    errorIdType: ErrorIdType.ANGEBOT,
                }),
            );
        }

        return results;
    }

    private async removeRollenerweiterung({
        organisationId,
        rolleId,
        serviceProviderId,
        errorId,
        errorIdType,
    }: RemoveRollenerweiterungParams): Promise<RollenerweiterungOperationResult> {
        const result: Result<null, DomainError> = await this.rollenerweiterungRepo.deleteByComposedId({
            organisationId,
            rolleId,
            serviceProviderId,
        });

        return {
            id: errorId,
            errorIdType,
            result,
        };
    }

    private async checkBasePermission(
        permissions: IPersonPermissions,
        organisationId: string,
    ): Promise<Result<null, MissingPermissionsError>> {
        const isAuthorized: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.ROLLEN_ERWEITERN,
        );
        if (!isAuthorized) {
            return Err(new MissingPermissionsError('Not authorized'));
        }

        return Ok(null);
    }

    private async checkMptPermissionForRolle(
        permissions: IPersonPermissions,
        organisationId: string,
        rolle: Rolle<true>,
    ): Promise<Result<null, MissingPermissionsError>> {
        if (!rolle.merkmale.includes(RollenMerkmal.MPT_ROLLE)) {
            return Ok(null);
        }

        const isAuthorized: boolean = await permissions.hasSystemrechtAtOrganisation(
            organisationId,
            RollenSystemRecht.MPT_ROLLEN_ZUORDNEN,
        );
        if (!isAuthorized) {
            return Err(new MissingPermissionsError('Not authorized'));
        }

        return Ok(null);
    }

    private combineResults(results: RollenerweiterungOperationResult[]): ApplyChangesResult {
        const errors: RollenerweiterungOperationError[] = results.filter(isErrorResult);

        if (errors.length === 0) {
            return Ok(null);
        }

        return Err(
            new ApplyRollenerweiterungError(
                errors.map(
                    (
                        error: RollenerweiterungOperationError,
                    ): {
                        id: string;
                        errorIdType: ErrorIdType;
                        error: DomainError;
                    } => ({
                        id: error.id,
                        errorIdType: error.errorIdType,
                        error: error.result.error,
                    }),
                ),
            ),
        );
    }
}
