import { Cursor, FilterQuery, Loaded, QueryOrder, raw, sql } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../../shared/error/missing-permissions.error.js';
import {
    OrganisationID,
    PersonID,
    PersonenkontextID,
    RolleID,
    ServiceProviderID,
} from '../../../shared/types/index.js';
import { PermittedOrgas } from '../../authentication/domain/person-permissions.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { EntityAggregateMapper } from '../../person/mapper/entity-aggregate.mapper.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { RolleEntity } from '../../rolle/entity/rolle.entity.js';
import { ServiceProviderSystem } from '../../service-provider/domain/service-provider.enum.js';
import { ServiceProviderEntity } from '../../service-provider/repo/service-provider.entity.js';
import { PersonenkontextFactory } from '../domain/personenkontext.factory.js';
import { Personenkontext } from '../domain/personenkontext.js';
import { PersonenkontextErweitertVirtualEntity } from './personenkontext-erweitert.virtual.entity.js';
import { PersonenkontextEntity } from './personenkontext.entity.js';
import { PersonenkontextScope } from './personenkontext.scope.js';
import { RolleServiceProviderEntity } from '../../rolle/entity/rolle-service-provider.entity.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { mapEntityToAggregate as mapSPEntityToAggregate } from '../../service-provider/repo/service-provider-entity-mapper.js';
import { Err, Ok } from '../../../shared/util/result.js';

export type RollenCount = { rollenart: string; count: string };

export type ErweiterterServiceProviderForPK = {
    personenkontext: Personenkontext<true>;
    serviceProvider: ServiceProvider<true>;
};

type ErweiterterServiceProviderForPKEntity = {
    personenkontext_id: string;
    service_provider_id: string;
};

export type ExternalPkData = {
    pkId: string;
    rolleId: RolleID;
    rollenart?: RollenArt;
    kennung?: string;
    serviceProvider?: ServiceProvider<true>[];
};

export type KontextWithOrgaAndRolle = {
    personenkontext: Personenkontext<true>;
    organisation: Organisation<true>;
    rolle: Rolle<true>;
};

type ExternalPkDataLoaded = Loaded<
    PersonenkontextEntity,
    'organisationId' | 'rolleId.serviceProvider.serviceProvider',
    'organisationId.kennung' | 'rolleId.rollenart' | 'rolleId.serviceProvider',
    never
>;

export type PersonenkontextErweitertVirtualEntityLoaded = Loaded<
    PersonenkontextErweitertVirtualEntity,
    'serviceProvider' | 'personenkontext',
    'serviceProvider' | 'personenkontext',
    never
>;

function mapEntityToAggregate(
    entity: PersonenkontextEntity,
    personenkontextFactory: PersonenkontextFactory,
): Personenkontext<boolean> {
    return personenkontextFactory.construct(
        entity.id,
        entity.createdAt,
        entity.updatedAt,
        entity.revision,
        entity.personId.id,
        entity.organisationId.id,
        entity.rolleId.id,
        entity.username,
        entity.mandant,
        entity.personenstatus,
        entity.jahrgangsstufe,
        entity.sichtfreigabe,
        entity.loeschungZeitpunkt,
        entity.befristung,
    );
}

@Injectable()
export class DBiamPersonenkontextRepo {
    public constructor(
        private readonly em: EntityManager,
        private readonly personenkontextFactory: PersonenkontextFactory,
        protected readonly entityAggregateMapper: EntityAggregateMapper,
    ) {}

    public async findByID(id: string): Promise<Option<Personenkontext<true>>> {
        const personenkontext: Option<PersonenkontextEntity> = await this.em.findOne(PersonenkontextEntity, {
            id,
        });

        return personenkontext && mapEntityToAggregate(personenkontext, this.personenkontextFactory);
    }

    public async findByIDAuthorized(
        id: PersonenkontextID,
        permissions: IPersonPermissions,
    ): Promise<Result<Personenkontext<true>, DomainError>> {
        const personenkontext: Option<PersonenkontextEntity> = await this.em.findOne(PersonenkontextEntity, {
            id,
        });

        if (!personenkontext) {
            return {
                ok: false,
                error: new EntityNotFoundError('Personenkontext', id),
            };
        }

        if (
            !(await permissions.hasSystemrechtAtOrganisation(
                personenkontext.organisationId.id,
                RollenSystemRecht.PERSONEN_VERWALTEN,
            ))
        ) {
            return {
                ok: false,
                error: new MissingPermissionsError('Access denied'),
            };
        }

        return { ok: true, value: mapEntityToAggregate(personenkontext, this.personenkontextFactory) };
    }

    public async hasPersonAnyReadableKontext(
        personId: PersonID,
        permissions: IPersonPermissions,
    ): Promise<Result<boolean, DomainError>> {
        const personenKontexte: PersonenkontextEntity[] = await this.em.find(PersonenkontextEntity, {
            personId,
        });

        if (personenKontexte.length === 0) {
            return { ok: true, value: false };
        }

        const organisationIds: OrganisationID[] = [
            ...new Set(personenKontexte.map((pk: PersonenkontextEntity) => pk.organisationId.id)),
        ];
        const hasReadAccessAtAnyKontext: boolean = (
            await Promise.all(
                organisationIds.map((organisationId: OrganisationID) =>
                    permissions.hasSystemrechtAtOrganisation(organisationId, RollenSystemRecht.PERSONEN_LESEN),
                ),
            )
        ).some((hasReadAccess: boolean) => hasReadAccess);

        if (!hasReadAccessAtAnyKontext) {
            return {
                ok: false,
                error: new MissingPermissionsError('Access denied'),
            };
        }

        return { ok: true, value: true };
    }

    public async findByPersonAuthorized(
        personId: PersonID,
        permissions: IPersonPermissions,
    ): Promise<Result<Personenkontext<true>[], MissingPermissionsError>> {
        const hasPermission: boolean = await permissions.canModifyPerson(personId);
        if (!hasPermission) {
            return Err(new MissingPermissionsError('Not authorized to manage person'));
        }

        const personenkontexte: Personenkontext<true>[] = await this.findByPerson(personId);
        return Ok(personenkontexte);
    }

    public async findByPerson(personId: PersonID): Promise<Personenkontext<true>[]> {
        const personenKontexte: PersonenkontextEntity[] = await this.em.find(PersonenkontextEntity, {
            personId,
        });

        return personenKontexte.map((pk: PersonenkontextEntity) =>
            mapEntityToAggregate(pk, this.personenkontextFactory),
        );
    }

    public async findByPersonWithOrgaAndRolle(personId: PersonID): Promise<Array<KontextWithOrgaAndRolle>> {
        const personenKontexte: PersonenkontextEntity[] = await this.em.find(
            PersonenkontextEntity,
            { personId },
            {
                populate: [
                    'organisationId',
                    'rolleId',
                    'rolleId.merkmale',
                    'rolleId.systemrechte',
                    'rolleId.serviceProvider',
                    'rolleId.serviceProvider.serviceProvider.merkmale',
                    'rolleId.serviceProvider.serviceProvider.rollenartenWhitelist',
                ],
            },
        );

        return personenKontexte.map((pk: PersonenkontextEntity) => {
            const orgaEntity: OrganisationEntity = pk.organisationId.unwrap();
            const rolleEntity: RolleEntity = pk.rolleId.unwrap();
            return {
                personenkontext: mapEntityToAggregate(pk, this.personenkontextFactory),
                organisation: this.entityAggregateMapper.mapOrganisationEntityToAggregate(orgaEntity),
                rolle: this.entityAggregateMapper.mapRolleEntityToAggregate(rolleEntity),
            };
        });
    }

    public async findByPersonIdsAndServiceprovidersWithOrgaAndRolle(
        personIds: PersonID[],
        serviceProviderIds: ServiceProviderID[],
        permittedOrgas: PermittedOrgas,
    ): Promise<Map<PersonID, KontextWithOrgaAndRolle[]>> {
        const result: Map<PersonID, KontextWithOrgaAndRolle[]> = new Map<PersonID, KontextWithOrgaAndRolle[]>();

        // Find all Personenkontexte where the serviceprovider is available through an erweiterung
        const erweiterungFilter: FilterQuery<PersonenkontextErweitertVirtualEntity>[] = [
            {
                personenkontext: {
                    personId: {
                        $in: personIds,
                    },
                },
            },
            {
                serviceProvider: {
                    $in: serviceProviderIds,
                },
            },
        ];

        if (!permittedOrgas.all) {
            erweiterungFilter.push({
                personenkontext: {
                    organisationId: {
                        $in: permittedOrgas.orgaIds,
                    },
                },
            });
        }

        const erweiterungen: PersonenkontextErweitertVirtualEntity[] = await this.em.find(
            PersonenkontextErweitertVirtualEntity,
            { $and: erweiterungFilter },
        );

        const filter: FilterQuery<NoInfer<PersonenkontextEntity>> = {
            personId: { $in: personIds },
            rolleId: {
                serviceProvider: {
                    serviceProvider: {
                        $in: serviceProviderIds,
                    },
                },
            },
        };

        if (!permittedOrgas.all) {
            filter.organisationId = {
                $in: permittedOrgas.orgaIds,
            };
        }

        const personenKontexte: PersonenkontextEntity[] = await this.em.find(
            PersonenkontextEntity,
            {
                $or: [
                    {
                        // Use found erweiterungen to fetch additional kontexte
                        id: {
                            $in: erweiterungen.map((e: PersonenkontextErweitertVirtualEntity) => e.personenkontext.id),
                        },
                    },
                    filter,
                ],
            },
            {
                populate: [
                    'organisationId',
                    'rolleId',
                    'rolleId.merkmale',
                    'rolleId.systemrechte',
                    'rolleId.serviceProvider',
                    'rolleId.serviceProvider.serviceProvider.merkmale',
                    'rolleId.serviceProvider.serviceProvider.rollenartenWhitelist',
                ],
            },
        );

        for (const pk of personenKontexte) {
            const personId: string = pk.personId.id;
            const orgaEntity: OrganisationEntity = pk.organisationId.unwrap();
            const rolleEntity: RolleEntity = pk.rolleId.unwrap();

            const kontext: KontextWithOrgaAndRolle = {
                personenkontext: mapEntityToAggregate(pk, this.personenkontextFactory),
                organisation: this.entityAggregateMapper.mapOrganisationEntityToAggregate(orgaEntity),
                rolle: this.entityAggregateMapper.mapRolleEntityToAggregate(rolleEntity),
            };

            if (!result.has(personId)) {
                result.set(personId, []);
            }

            result.get(personId)!.push(kontext);
        }

        return result;
    }

    public async findBy(scope: PersonenkontextScope): Promise<Counted<Personenkontext<true>>> {
        const [entities, total]: Counted<PersonenkontextEntity> = await scope.executeQuery(this.em);
        const kontexte: Personenkontext<true>[] = entities.map((entity: PersonenkontextEntity) =>
            mapEntityToAggregate(entity, this.personenkontextFactory),
        );

        return [kontexte, total];
    }

    public async findByPersonIds(personIds: PersonID[]): Promise<Map<PersonID, Personenkontext<true>[]>> {
        const personenKontextEntities: PersonenkontextEntity[] = await this.em.find(PersonenkontextEntity, {
            personId: { $in: personIds },
        });

        const personenKontextMap: Map<PersonID, Personenkontext<true>[]> = new Map();

        personenKontextEntities.forEach((entity: PersonenkontextEntity) => {
            const aggregate: Personenkontext<true> = mapEntityToAggregate(entity, this.personenkontextFactory);
            if (!personenKontextMap.has(entity.personId.id)) {
                personenKontextMap.set(entity.personId.id, []);
            }
            personenKontextMap.get(entity.personId.id)!.push(aggregate);
        });

        return personenKontextMap;
    }

    public async findByRolle(rolleId: string): Promise<Personenkontext<true>[]> {
        const personenKontexte: PersonenkontextEntity[] = await this.em.find(PersonenkontextEntity, {
            rolleId,
        });

        return personenKontexte.map((pk: PersonenkontextEntity) =>
            mapEntityToAggregate(pk, this.personenkontextFactory),
        );
    }

    /**
     * Find all Personenkontexte with the specified Rolle, if
     * - they are at an organisation where itslearning is enabled
     * - there is no other Personenkontext_
     *   - for the same person
     *   - at the same organisation
     *   - with a different rolle
     *   - that has the itslearning service provider
     */
    public async findWithRolleAtItslearningOrgaByCursor(
        rolleId: RolleID,
        count: number,
        cursor?: string,
    ): Promise<[pks: Personenkontext<true>[], cursor: string | undefined]> {
        const personenkontextCursor: Cursor<PersonenkontextEntity> = await this.em.findByCursor(PersonenkontextEntity, {
            where: {
                rolleId,
                organisationId: {
                    itslearningEnabled: true,
                },
                [raw(
                    (alias: string) =>
                        `NOT EXISTS (${this.em
                            .createQueryBuilder(PersonenkontextEntity, 'sq')
                            .select('id')
                            .where({
                                personId: sql.ref(alias, 'person_id'),
                                organisationId: sql.ref(alias, 'organisation_id'),
                                rolleId: {
                                    $ne: rolleId,
                                    serviceProvider: {
                                        serviceProvider: {
                                            externalSystem: ServiceProviderSystem.ITSLEARNING,
                                        },
                                    },
                                },
                            })
                            .getFormattedQuery()})`,
                )]: [],
            },

            after: cursor,
            first: count,
            orderBy: { id: QueryOrder.ASC },
        });

        return [
            personenkontextCursor.items.map((pk: PersonenkontextEntity) =>
                mapEntityToAggregate(pk, this.personenkontextFactory),
            ),
            personenkontextCursor.endCursor ?? undefined, // Map null to undefined
        ];
    }

    public async find(
        personId: PersonID,
        organisationId: OrganisationID,
        rolleId: RolleID,
    ): Promise<Option<Personenkontext<true>>> {
        const personenKontext: Option<PersonenkontextEntity> = await this.em.findOne(
            PersonenkontextEntity,
            {
                personId,
                rolleId,
                organisationId,
            },
            {},
        );
        if (personenKontext) {
            return mapEntityToAggregate(personenKontext, this.personenkontextFactory);
        }

        return null;
    }

    public async findExternalPkData(personId: PersonID): Promise<ExternalPkData[]> {
        const personenkontextEntities: ExternalPkDataLoaded[] = await this.em.find(
            PersonenkontextEntity,
            { personId },
            {
                populate: [
                    'rolleId.serviceProvider.serviceProvider',
                    'rolleId.serviceProvider.serviceProvider.merkmale',
                    'rolleId.serviceProvider.serviceProvider.rollenartenWhitelist',
                    'organisationId',
                ],
                exclude: [
                    'rolleId.serviceProvider.serviceProvider.logo',
                    'rolleId.serviceProvider.serviceProvider.logoMimeType',
                ],
            },
        );
        return personenkontextEntities.map((pk: ExternalPkDataLoaded) => {
            const serviceProviders: ServiceProviderEntity[] = pk.rolleId
                .unwrap()
                .serviceProvider.getItems()
                .map((rsp: RolleServiceProviderEntity) => rsp.serviceProvider);

            return {
                pkId: pk.id,
                rolleId: pk.rolleId.unwrap().id,
                rollenart: pk.rolleId.unwrap().rollenart,
                kennung: pk.organisationId.unwrap().kennung,
                serviceProvider: serviceProviders.map((sp: ServiceProviderEntity) => mapSPEntityToAggregate(sp)),
            };
        });
    }

    public async hasSystemrechtAtOrganisation(
        personId: PersonID,
        organisationId: OrganisationID,
        systemrecht: RollenSystemRecht,
    ): Promise<boolean> {
        const query: string = `
            WITH RECURSIVE parent_organisations AS (
                SELECT id, administriert_von
                FROM public.organisation
                WHERE id = ?
                UNION ALL
                SELECT o.id, o.administriert_von
                FROM public.organisation o
                INNER JOIN parent_organisations po ON o.id = po.administriert_von
            ),
            person_roles_at_orgas AS (
                SELECT DISTINCT pk.rolle_id
                FROM parent_organisations po
                JOIN public.personenkontext pk ON pk.organisation_id = po.id AND pk.person_id = ?
            )
            SELECT EXISTS (
                SELECT 1
                FROM person_roles_at_orgas pr
                JOIN public.rolle_systemrecht sr ON sr.rolle_id = pr.rolle_id
                WHERE sr.systemrecht = ?
            ) AS has_systemrecht_at_orga;
                        `;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any[] = await this.em.execute(query, [organisationId, personId, systemrecht.name]);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return result[0].has_systemrecht_at_orga as boolean;
    }

    public async hasPersonASystemrechtAtAnyKontextOfPersonB(
        personIdA: PersonID,
        personIdB: PersonID,
        systemrecht: RollenSystemRecht,
    ): Promise<boolean> {
        const query: string = `
        WITH RECURSIVE all_orgas_where_personb_has_any_kontext_with_parents AS (
                    SELECT id, administriert_von
                    FROM public.organisation
                    WHERE id IN (
                        SELECT organisation_id
                        FROM public.personenkontext
                        WHERE person_id = ?
                    )
                    UNION ALL
                    SELECT o.id, o.administriert_von
                    FROM public.organisation o
                    INNER JOIN all_orgas_where_personb_has_any_kontext_with_parents po ON o.id = po.administriert_von
                ),
                kontexts_personB_at_orgas AS (
                    SELECT pk.*
                    FROM public.personenkontext pk
                    WHERE pk.person_id = ? AND pk.organisation_id IN (SELECT id FROM all_orgas_where_personb_has_any_kontext_with_parents)
                ),
                permission_check AS (
                    SELECT EXISTS (
                        SELECT 1
                        FROM kontexts_personB_at_orgas kb
                        JOIN public.rolle_systemrecht sr ON sr.rolle_id = kb.rolle_id
                        WHERE sr.systemrecht = ?
                    ) AS has_persona_systemrecht_at_any_kontext_of_personb
                )
                SELECT has_persona_systemrecht_at_any_kontext_of_personb FROM permission_check;
                    `;

        const result: [{ has_persona_systemrecht_at_any_kontext_of_personb: boolean }] = await this.em.execute(query, [
            personIdB,
            personIdA,
            systemrecht.name,
        ]);
        return result[0].has_persona_systemrecht_at_any_kontext_of_personb;
    }

    public async isOrganisationAlreadyAssigned(organisationId: string): Promise<boolean> {
        const personenKontexte: PersonenkontextEntity[] = await this.em.find(PersonenkontextEntity, {
            organisationId,
        });

        return personenKontexte.length > 0;
    }

    public async isRolleAlreadyAssigned(id: RolleID): Promise<boolean> {
        return (await this.findByRolle(id)).length > 0;
    }

    public async getPersonenKontexteWithExpiredBefristung(): Promise<Map<PersonID, Personenkontext<true>[]>> {
        const filters: FilterQuery<PersonenkontextEntity> = {
            personId: {
                personenKontexte: {
                    $some: {
                        befristung: {
                            $lt: new Date(),
                        },
                    },
                },
            },
        };

        const personenKontexteEntities: PersonenkontextEntity[] = await this.em.find(PersonenkontextEntity, filters);
        const personenKontexte: Personenkontext<true>[] = personenKontexteEntities.map((pk: PersonenkontextEntity) =>
            mapEntityToAggregate(pk, this.personenkontextFactory),
        );

        // Grouping the entities by personId
        const groupedByPerson: Map<PersonID, Personenkontext<true>[]> = new Map();
        for (const kontext of personenKontexte) {
            const group: Personenkontext<true>[] = groupedByPerson.get(kontext.personId) ?? [];
            if (group.length === 0) {
                groupedByPerson.set(kontext.personId, group);
            }
            group.push(kontext);
        }

        return groupedByPerson;
    }

    public async getPersonenkontextRollenCount(): Promise<RollenCount[]> {
        const query: string = `SELECT rollenart, COUNT(*) as count
                               FROM (
                                   SELECT DISTINCT person_id, rollenart
                                   FROM personenkontext
                                   JOIN rolle ON personenkontext.rolle_id = rolle.id
                               ) as distinct_roles
                               GROUP BY rollenart;`;

        const result: RollenCount[] = await this.em.execute(query, []);
        return result;
    }

    public async findErweiterteSPByPersonId(personId: PersonID): Promise<ErweiterterServiceProviderForPK[]> {
        const query: string = `
            WITH RECURSIVE
            expanded_rollenerweiterung AS (
                SELECT
                    re.rolle_id,
                    re.organisation_id,
                    re.service_provider_id
                FROM
                    public.rollenerweiterung re
                UNION ALL
                SELECT
                    exp.rolle_id,
                    o.id,
                    exp.service_provider_id
                FROM
                    expanded_rollenerweiterung exp
                    INNER JOIN public.organisation o ON o.administriert_von = exp.organisation_id
            )
        SELECT
            pk.id as personenkontext_id,
            ere.service_provider_id as service_provider_id
        FROM
            public.personenkontext pk
        INNER JOIN
            expanded_rollenerweiterung ere ON (pk.organisation_id = ere.organisation_id AND pk.rolle_id = ere.rolle_id)
        WHERE pk.person_id = ?
        `;

        const rows: ErweiterterServiceProviderForPKEntity[] = await this.em.execute(query, [personId]);

        const pkIds: string[] = [
            ...new Set(rows.map((r: ErweiterterServiceProviderForPKEntity) => r.personenkontext_id)),
        ];
        const spIds: string[] = [
            ...new Set(rows.map((r: ErweiterterServiceProviderForPKEntity) => r.service_provider_id)),
        ];

        const [pks, sps]: [PersonenkontextEntity[], ServiceProviderEntity[]] = await Promise.all([
            this.em.find(PersonenkontextEntity, { id: { $in: pkIds } }),
            this.em.find(
                ServiceProviderEntity,
                { id: { $in: spIds } },

                {
                    populate: ['merkmale', 'rollenartenWhitelist'],
                    exclude: ['logo', 'logoMimeType'],
                },
            ),
        ]);

        const pkById: Map<string, PersonenkontextEntity> = new Map(pks.map((p: PersonenkontextEntity) => [p.id, p]));
        const spById: Map<string, ServiceProviderEntity> = new Map(sps.map((s: ServiceProviderEntity) => [s.id, s]));

        //The case that pk or sp doesnt exist in pkByUd or spById is not be possible since the query returns only existing pk and sp ids.
        //A type assertion on .get is used to avoid returning errors and handling them, even though such errors can never actually occur.
        const result: ErweiterterServiceProviderForPK[] = rows.map((r: ErweiterterServiceProviderForPKEntity) => {
            const personenkontext: PersonenkontextEntity = pkById.get(r.personenkontext_id)!;
            const serviceProvider: ServiceProviderEntity = spById.get(r.service_provider_id)!;

            const pkResp: Personenkontext<boolean> = mapEntityToAggregate(personenkontext, this.personenkontextFactory);
            const spResp: ServiceProvider<boolean> = mapSPEntityToAggregate(serviceProvider);

            return { personenkontext: pkResp, serviceProvider: spResp };
        });

        return result;
    }
}
