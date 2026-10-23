import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM, type RequiredEntityData } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    createPersonPermissionsMock,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { type DataConfig } from '../../../shared/config/index.js';
import { type ServerConfig } from '../../../shared/config/server.config.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityCouldNotBeUpdated } from '../../../shared/error/entity-could-not-be-updated.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { type KafkaSchuleUpdatedEvent } from '../../../shared/events/kafka-schule-updated.event.js';
import { type SchuleUpdatedEvent } from '../../../shared/events/schule-updated.event.js';
import { type IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { ScopeOperator, ScopeOrder } from '../../../shared/persistence/index.js';
import { type OrganisationID } from '../../../shared/types/index.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { OrganisationUpdateOutdatedError } from '../domain/orga-update-outdated.error.js';
import { OrganisationsTyp, RootDirectChildrenType, SortFieldOrganisation } from '../domain/organisation.enums.js';
import { Organisation, type Organisationsbeziehung, type Organisationsbeziehungen } from '../domain/organisation.js';
import { OrganisationSpecificationError } from '../specification/error/organisation-specification.error.js';
import { SchultraegerNameEindeutigError } from '../specification/error/SchultraegerNameEindeutigError.js';
import { TraegerUnterRootChildError } from '../specification/error/traeger-unter-root-child.error.js';
import { OrganisationEntity } from './organisation.entity.js';
import {
    mapOrgaAggregateToData,
    mapOrgaEntityToAggregate,
    mapOrgaEntityToAggregateWithRelationships,
    mapOrganisationsbeziehungEntityToAggregate,
    OrganisationRepository,
} from './organisation.repository.js';
import { OrganisationScope } from './organisation.scope.js';
import { OrganisationsbeziehungsTyp } from '../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationsbeziehungEntity } from './organisationsbeziehung.entity.js';

describe('OrganisationRepository', () => {
    let module: TestingModule;
    let sut: OrganisationRepository;
    let orm: MikroORM;
    let em: EntityManager;
    let config: ConfigService<ServerConfig>;
    let ROOT_ORGANISATION_ID: string;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true })],
            providers: [
                OrganisationRepository,
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
            ],
        }).compile();
        sut = module.get(OrganisationRepository);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        config = module.get(ConfigService<ServerConfig>);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    beforeAll(() => {
        ROOT_ORGANISATION_ID = config.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    async function createPersistedOrganisation(typ: OrganisationsTyp): Promise<Organisation<true, false>> {
        const organisation: Organisation<false, false> | DomainError = Organisation.createNew(
            faker.company.name(),
            typ,
        );
        if (organisation instanceof DomainError) {
            throw organisation;
        }

        return sut.save(organisation);
    }

    describe('findById', () => {
        it('should return one organisation by id', async () => {
            const orga: Organisation<false> | DomainError = Organisation.createNew(
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
            );
            if (orga instanceof DomainError) {
                return;
            }
            const organisaiton: Organisation<true> = await sut.save(orga);
            const foundOrganisation: Option<Organisation<true>> = await sut.findById(organisaiton.id);

            expect(foundOrganisation).toBeTruthy();
            expect(foundOrganisation).toEqual(organisaiton);
        });

        it('should return undefined when organisation cannot be found', async () => {
            const foundOrganisation: Option<Organisation<true>> = await sut.findById(faker.string.uuid());
            expect(foundOrganisation).toBeFalsy();
            expect(foundOrganisation).toBeNull();
        });
    });

    describe('mapAggregateToData', () => {
        it('should return Organisation RequiredEntityData', () => {
            const organisation: Organisation<true, false> = Organisation.construct<true, false>(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
                undefined,
                faker.string.uuid(),
                faker.string.uuid(),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
                undefined,
            );

            const expectedProperties: string[] = [
                'administriertVon',
                'zugehoerigZu',
                'kennung',
                'name',
                'namensergaenzung',
                'kuerzel',
                'typ',
                'traegerschaft',
                'emailDomain',
                'emailAddress',
                'itslearningEnabled',
            ];

            const result: RequiredEntityData<OrganisationEntity> = mapOrgaAggregateToData(organisation);

            expectedProperties.forEach((prop: string) => {
                expect(result).toHaveProperty(prop);
            });
        });
    });

    describe('mapEntityToAggregate', () => {
        it('should return an Organisation without loaded relationships', () => {
            const organisationEntity: OrganisationEntity = em.create(
                OrganisationEntity,
                mapOrgaAggregateToData(DoFactory.createOrganisation(true)),
            );

            const organisation: Organisation<true, false> = mapOrgaEntityToAggregate(organisationEntity);

            expect(organisation).toBeInstanceOf(Organisation);
            expect(organisation.organisationsbeziehungen).toBeUndefined();
        });
    });

    describe('mapOrganisationsbeziehungEntityToAggregate', () => {
        it('should map the entity to a persisted Organisationsbeziehung', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const entity: OrganisationsbeziehungEntity = em.create(OrganisationsbeziehungEntity, {
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULAUFSICHT,
            });

            await em.persist(entity).flush();

            const result: Organisationsbeziehung<true> = mapOrganisationsbeziehungEntityToAggregate(entity);

            expect(result).toEqual({
                id: entity.id,
                createdAt: entity.createdAt,
                updatedAt: entity.updatedAt,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULAUFSICHT,
            });
        });
    });

    describe('mapOrgaEntityToAggregateWithRelationships', () => {
        it('should map an OrganisationEntity with relationships to an Organisation aggregate', () => {
            const organisationEntity: OrganisationEntity = em.create(
                OrganisationEntity,
                mapOrgaAggregateToData(DoFactory.createOrganisation(true)),
            );

            const organisationsbeziehung: Organisationsbeziehung<true> = {
                id: faker.string.uuid(),
                createdAt: faker.date.past(),
                updatedAt: faker.date.recent(),
                quellOrganisationId: organisationEntity.id,
                zielOrganisationId: faker.string.uuid(),
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            };

            const organisationsbeziehungen: Organisationsbeziehungen = [organisationsbeziehung];

            const result: Organisation<true, true> = mapOrgaEntityToAggregateWithRelationships(
                organisationEntity,
                organisationsbeziehungen,
            );

            expect(result).toBeInstanceOf(Organisation);
            expect(result.id).toBe(organisationEntity.id);
            expect(result.createdAt).toBe(organisationEntity.createdAt);
            expect(result.updatedAt).toBe(organisationEntity.updatedAt);
            expect(result.version).toBe(organisationEntity.version);
            expect(result.name).toBe(organisationEntity.name);
            expect(result.typ).toBe(organisationEntity.typ);
            expect(result.organisationsbeziehungen).toEqual(organisationsbeziehungen);
        });

        it('should map an OrganisationEntity with an empty relationship collection', () => {
            const organisationEntity: OrganisationEntity = em.create(
                OrganisationEntity,
                mapOrgaAggregateToData(DoFactory.createOrganisation(true)),
            );

            const organisationsbeziehungen: Organisationsbeziehungen = [];

            const result: Organisation<true, true> = mapOrgaEntityToAggregateWithRelationships(
                organisationEntity,
                organisationsbeziehungen,
            );

            expect(result).toBeInstanceOf(Organisation);
            expect(result.organisationsbeziehungen).toEqual([]);
        });
    });

    describe('exists', () => {
        it('should return true if the orga exists', async () => {
            const orga: Organisation<false, false> | DomainError = Organisation.createNew(
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
                undefined,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                faker.string.numeric(6),
                faker.company.name(),
            );
            if (orga instanceof DomainError) {
                return;
            }

            const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));

            await em.persist(mappedOrga).flush();

            await expect(sut.exists(mappedOrga.id)).resolves.toBe(true);
        });

        it('should return false if the orga does not exists', async () => {
            await expect(sut.exists(faker.string.uuid())).resolves.toBe(false);
        });
    });

    describe('findById', () => {
        it('should return the organisation if it exists', async () => {
            const orga: Organisation<false, false> | DomainError = Organisation.createNew(
                faker.lorem.word(),
                OrganisationsTyp.SCHULE,
                undefined,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                faker.string.numeric(6),
                faker.company.name(),
            );
            if (orga instanceof DomainError) {
                return;
            }

            const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));

            await em.persist(mappedOrga).flush();

            await expect(sut.findById(mappedOrga.id)).resolves.toBeInstanceOf(Organisation);
        });

        it('should return null', async () => {
            await expect(sut.findById(faker.string.uuid())).resolves.toBeNull();
        });
    });

    describe('findBy', () => {
        let organisation1: Organisation<false, false>;
        let organisation2: Organisation<false, false>;
        let organisation3: Organisation<false, false>;
        let organisationEntity1: OrganisationEntity;
        let organisationEntity2: OrganisationEntity;
        let organisationEntity3: OrganisationEntity;

        beforeEach(async () => {
            organisation1 = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                'Name1',
                OrganisationsTyp.SCHULE,
                undefined,
                faker.string.uuid(),
                faker.string.uuid(),
                '05674',
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );
            organisation2 = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                'Name2',
                OrganisationsTyp.ROOT,
                undefined,
                faker.string.uuid(),
                faker.string.uuid(),
                '44123',
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );
            organisation3 = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                'TestSchule',
                OrganisationsTyp.SCHULE,
                undefined,
                faker.string.uuid(),
                faker.string.uuid(),
                '75693',
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );
            organisationEntity1 = em.create(OrganisationEntity, mapOrgaAggregateToData(organisation1));
            organisationEntity2 = em.create(OrganisationEntity, mapOrgaAggregateToData(organisation2));
            organisationEntity3 = em.create(OrganisationEntity, mapOrgaAggregateToData(organisation3));
            await em.persist([organisationEntity1, organisationEntity2, organisationEntity3]).flush();
        });

        afterEach(async () => {
            await em.remove([organisationEntity1, organisationEntity2]).flush();
        });
        describe('When Called Only With searchString', () => {
            it('should return Correct Aggregates By SearchString', async () => {
                const [result]: Counted<Organisation<true>> = await sut.findBy(
                    new OrganisationScope().searchString(organisation1.kennung),
                );

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(1);
                expect(result.at(0)?.kennung).toEqual(organisation1.kennung);
            });

            it('should return Correct Aggregates By SearchString', async () => {
                const [result]: Counted<Organisation<true>> = await sut.findBy(
                    new OrganisationScope().searchString('Name2'),
                );

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(1);
                expect(result.at(0)?.kennung).toEqual(organisation2.kennung);
            });

            it('should return Correct Aggregates By SearchString', async () => {
                const [result]: Counted<Organisation<true>> = await sut.findBy(
                    new OrganisationScope().searchString('Name'),
                );

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(2);
            });
        });
        describe('When Called Only With filters', () => {
            it('should return Correct Aggregates By Filters', async () => {
                const [result]: Counted<Organisation<true>> = await sut.findBy(
                    new OrganisationScope().findBy({
                        kennung: organisation1.kennung,
                    }),
                );

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(1);
                expect(result.at(0)?.kennung).toEqual(organisation1.kennung);
            });

            it('should return Correct Aggregates By Filters', async () => {
                const [result]: Counted<Organisation<true>> = await sut.findBy(
                    new OrganisationScope().findBy({
                        typ: OrganisationsTyp.SCHULE,
                    }),
                );

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(2);
            });
        });
        describe('When Called With searchString & filters and scopeWhere Operator AND', () => {
            it('should return Correct Aggregates By Filters AND searchString', async () => {
                const [result]: Counted<Organisation<true>> = await sut.findBy(
                    new OrganisationScope()
                        .findBy({
                            typ: OrganisationsTyp.SCHULE,
                        })
                        .setScopeWhereOperator(ScopeOperator.AND)
                        .searchString('Test'),
                );

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(1);
                expect(result.at(0)?.kennung).toEqual(organisation3.kennung);
            });
        });

        describe('When Called With searchString & filters and scopeWhere Operator OR', () => {
            it('should return Correct Aggregates By Filters OR searchString', async () => {
                const [result]: Counted<Organisation<true>> = await sut.findBy(
                    new OrganisationScope()
                        .findBy({
                            typ: OrganisationsTyp.SCHULE,
                        })
                        .setScopeWhereOperator(ScopeOperator.OR)
                        .searchString('Test'),
                );

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(2);
            });
        });
    });

    describe('findChildOrgasByIds', () => {
        async function createOrgaTree(): Promise<[root: string, traeger: string, schule: string]> {
            const root: Organisation<true, false> = Organisation.construct(
                sut.ROOT_ORGANISATION_ID,
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                undefined,
                undefined,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );

            const traeger: Organisation<true, false> = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                root.id,
                root.id,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );

            const schule: Organisation<true, false> = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                traeger.id,
                traeger.id,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );

            await em
                .persist([
                    em.create(OrganisationEntity, mapOrgaAggregateToData(root)),
                    em.create(OrganisationEntity, mapOrgaAggregateToData(traeger)),
                    em.create(OrganisationEntity, mapOrgaAggregateToData(schule)),
                ])
                .flush();

            return [root.id, traeger.id, schule.id];
        }

        describe('when no input IDs are given', () => {
            it('should return empty array', async () => {
                const result: Organisation<true>[] = await sut.findChildOrgasForIds([]);

                expect(result).toHaveLength(0);
            });
        });

        describe('when root organisation', () => {
            it('should return all organisations', async () => {
                const [rootId]: [string, string, string] = await createOrgaTree();

                const result: Organisation<true>[] = await sut.findChildOrgasForIds([rootId]);

                expect(result).toHaveLength(2);
            });
        });

        describe('when not root organisation', () => {
            it('should return all child organisations', async () => {
                const [, traegerId]: [string, string, string] = await createOrgaTree();

                const result: Organisation<true>[] = await sut.findChildOrgasForIds([traegerId]);

                expect(result).toHaveLength(1);
            });
        });

        it('should map column names correctly', async () => {
            const [, traegerId]: [string, string, string] = await createOrgaTree();

            const result: Organisation<true>[] = await sut.findChildOrgasForIds([traegerId]);

            expect(result).toHaveLength(1);
            expect(result[0]?.createdAt).not.toBeUndefined();
            expect(result[0]?.updatedAt).not.toBeUndefined();
            expect(result[0]?.administriertVon).not.toBeUndefined();
            expect(result[0]?.zugehoerigZu).not.toBeUndefined();
        });
    });

    describe('findEmailDomainForOrganisation', () => {
        type CreateOrgaTreeResult = {
            root: Organisation<true, false>;
            traeger: Organisation<true, false>;
            schule: Organisation<true, false>;
        };
        async function createOrgaTreeWithDomains(
            rootDomain?: string,
            traegerDomain?: string,
            schuleDomain?: string,
        ): Promise<CreateOrgaTreeResult> {
            const root: Organisation<true> = Organisation.construct(
                sut.ROOT_ORGANISATION_ID,
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                undefined,
                undefined,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
                rootDomain,
            );

            const traeger: Organisation<true> = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                root.id,
                root.id,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
                traegerDomain,
            );

            const schule: Organisation<true> = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                traeger.id,
                traeger.id,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
                schuleDomain,
            );

            await em
                .persist([
                    em.create(OrganisationEntity, mapOrgaAggregateToData(root)),
                    em.create(OrganisationEntity, mapOrgaAggregateToData(traeger)),
                    em.create(OrganisationEntity, mapOrgaAggregateToData(schule)),
                ])
                .flush();

            return { root, traeger, schule };
        }

        const domain: string = 'schule-sh.de';

        it('should return emailDomain for root provided by root', async () => {
            const { root }: CreateOrgaTreeResult = await createOrgaTreeWithDomains(domain, undefined, undefined);

            const result: string | undefined = await sut.findEmailDomainForOrganisation(root.id);

            expect(result).toBeDefined();
            expect(result).toStrictEqual(domain);
        });

        it('should return emailDomain for schule provided by traeger', async () => {
            const { root, traeger, schule }: CreateOrgaTreeResult = await createOrgaTreeWithDomains(
                undefined,
                domain,
                undefined,
            );

            const result: string | undefined = await sut.findEmailDomainForOrganisation(traeger.id);

            expect(root).toBeDefined();
            expect(schule).toBeDefined();
            expect(result).toBeDefined();
            expect(result).toStrictEqual(domain);
        });

        it('should return emailDomain for schule provided by root', async () => {
            const { root, traeger, schule }: CreateOrgaTreeResult = await createOrgaTreeWithDomains(
                domain,
                undefined,
                undefined,
            );

            const result: string | undefined = await sut.findEmailDomainForOrganisation(schule.id);

            expect(root).toBeDefined();
            expect(traeger).toBeDefined();
            expect(result).toBeDefined();
            expect(result).toStrictEqual(domain);
        });

        it('should return undefined when NO organisation in tree has an email-domain', async () => {
            const { root, traeger, schule }: CreateOrgaTreeResult = await createOrgaTreeWithDomains(
                undefined,
                undefined,
                undefined,
            );

            const result: string | undefined = await sut.findEmailDomainForOrganisation(schule.id);

            expect(root).toBeDefined();
            expect(traeger).toBeDefined();
            expect(schule).toBeDefined();
            expect(result).toBeUndefined();
        });

        // This test covers getDomainRecursive, case 'no organisations, first cancel condition'
        it('should return undefined when NO organisation were found via findParentOrgasForIdSortedByDepthAsc', async () => {
            //no tree-creation here -> mocks no organisations could be found
            const result: string | undefined = await sut.findEmailDomainForOrganisation(faker.string.uuid());

            expect(result).toBeUndefined();
        });
    });

    describe('findParentOrgas-Methods', () => {
        type CreateOrgaTreeResult = {
            root: Organisation<true, false>;
            traeger: Organisation<true, false>;
            schule: Organisation<true, false>;
        };
        async function createOrgaTree(): Promise<CreateOrgaTreeResult> {
            const root: Organisation<true, false> = Organisation.construct(
                sut.ROOT_ORGANISATION_ID,
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                undefined,
                undefined,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
            );

            const traeger: Organisation<true, false> = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                root.id,
                root.id,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
            );

            const schule: Organisation<true, false> = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.alphanumeric(10),
                OrganisationsTyp.ROOT,
                undefined,
                traeger.id,
                traeger.id,
                faker.string.numeric(6),
                faker.lorem.word(),
                faker.string.uuid(),
            );

            await em
                .persist([
                    em.create(OrganisationEntity, mapOrgaAggregateToData(root)),
                    em.create(OrganisationEntity, mapOrgaAggregateToData(traeger)),
                    em.create(OrganisationEntity, mapOrgaAggregateToData(schule)),
                ])
                .flush();

            return { root, traeger, schule };
        }

        describe('findParentOrgasForIds', () => {
            describe('when no input IDs are given', () => {
                it('should return empty array', async () => {
                    const result: Organisation<true>[] = await sut.findParentOrgasForIds([]);

                    expect(result).toHaveLength(0);
                });
            });

            describe('when leaf organisation', () => {
                it('should return all organisations', async () => {
                    const { schule }: CreateOrgaTreeResult = await createOrgaTree();

                    const result: Organisation<true>[] = await sut.findParentOrgasForIds([schule.id]);

                    expect(result).toHaveLength(3);
                });
            });

            describe('when multiple organisation', () => {
                it('should not return duplicate organisations', async () => {
                    const { root, traeger, schule }: CreateOrgaTreeResult = await createOrgaTree();

                    const result: Organisation<true>[] = await sut.findParentOrgasForIds([
                        root.id,
                        traeger.id,
                        schule.id,
                    ]);

                    expect(result).toHaveLength(3);
                });
            });

            describe('when root organisation', () => {
                it('should return only root', async () => {
                    const { root }: CreateOrgaTreeResult = await createOrgaTree();

                    const result: Organisation<true>[] = await sut.findParentOrgasForIds([root.id]);

                    expect(result).toHaveLength(1);
                });
            });
        });

        describe('findParentOrgasForIdSorted', () => {
            describe('when leaf organisation', () => {
                it('should return all organisations sorted by depth asc', async () => {
                    const { root, traeger, schule }: CreateOrgaTreeResult = await createOrgaTree();

                    const result: Organisation<true>[] = await sut.findParentOrgasForIdSortedByDepthAsc(schule.id);

                    expect(result).toHaveLength(3);
                    expect(result[0]).toMatchObject({
                        id: schule.id,
                    });
                    expect(result[1]).toMatchObject({
                        id: traeger.id,
                    });
                    expect(result[2]).toMatchObject({
                        id: root.id,
                    });
                });
            });

            describe('when root organisation', () => {
                it('should return only root', async () => {
                    const { root }: CreateOrgaTreeResult = await createOrgaTree();

                    const result: Organisation<true>[] = await sut.findParentOrgasForIdSortedByDepthAsc(root.id);

                    expect(result).toHaveLength(1);
                });
            });
        });

        it('should map column names correctly', async () => {
            const { root }: CreateOrgaTreeResult = await createOrgaTree();

            const result: Organisation<true>[] = await sut.findParentOrgasForIds([root.id]);

            expect(result).toHaveLength(1);
            expect(result[0]?.createdAt).not.toBeUndefined();
            expect(result[0]?.updatedAt).not.toBeUndefined();
        });
    });

    describe('findRootDirectChildren', () => {
        let root: Organisation<false, false>;
        let oeffentlich: Organisation<false, false>;
        let ersatz: Organisation<false, false>;
        let organisationEntity1: OrganisationEntity;
        let organisationEntity2: OrganisationEntity;
        let organisationEntity3: OrganisationEntity;

        beforeEach(async () => {
            root = Organisation.construct(
                ROOT_ORGANISATION_ID,
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.numeric(),
                OrganisationsTyp.SCHULE,
                undefined,
                faker.string.uuid(),
                faker.string.uuid(),
                'Root',
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );
            oeffentlich = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.numeric(),
                OrganisationsTyp.ROOT,
                undefined,
                ROOT_ORGANISATION_ID,
                faker.string.uuid(),
                'Öffentliche Schulen Land Schleswig-Holstein',
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );
            ersatz = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                faker.string.numeric(),
                OrganisationsTyp.SCHULE,
                undefined,
                ROOT_ORGANISATION_ID,
                faker.string.uuid(),
                'Ersatzschulen Land Schleswig-Holstein',
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );
            organisationEntity1 = em.create(OrganisationEntity, mapOrgaAggregateToData(root));
            organisationEntity2 = em.create(OrganisationEntity, mapOrgaAggregateToData(oeffentlich));
            organisationEntity3 = em.create(OrganisationEntity, mapOrgaAggregateToData(ersatz));
            await em.persist([organisationEntity1, organisationEntity2, organisationEntity3]).flush();
        });

        describe('When Called', () => {
            it('should return flaged oeffentlich & ersatz root nodes', async () => {
                const result: [Organisation<true> | undefined, Organisation<true> | undefined] =
                    await sut.findRootDirectChildren();

                expect(result).toBeInstanceOf(Array);
                expect(result).toHaveLength(2);
            });
        });
    });

    describe('Update Organisationsname - Klasse', () => {
        const permissionsMock: IPersonPermissions = createPersonPermissionsMock();
        describe('when organisation does not exist', () => {
            it('should return EntityNotFoundError', async () => {
                const id: string = faker.string.uuid();
                const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                    id,
                    faker.company.name(),
                    faker.number.int(),
                    permissionsMock,
                );

                expect(result).toEqual(new EntityNotFoundError('Organisation', id));
            });
        });

        describe('when parent organisation does not exist in database', () => {
            it('should return EntityNotFoundError', async () => {
                const parentOrganisation: Organisation<false, false> = DoFactory.createOrganisation(false);
                parentOrganisation.id = faker.string.uuid();
                const organisation: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: parentOrganisation.id,
                });
                const savedOrganisation: Organisation<true> = await sut.save(organisation);

                const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                    savedOrganisation.id,
                    'newName',
                    1,
                    permissionsMock,
                );
                expect(result).toEqual(new EntityNotFoundError('Organisation', parentOrganisation.id));
            });
        });

        describe('when parent organisation does exist in database but its name is undefined', () => {
            it('should return EntityCouldNotBeUpdated error', async () => {
                const parentOrganisation: Organisation<false, false> = DoFactory.createOrganisation(false);
                parentOrganisation.name = '';
                const savedParentOrganisation: Organisation<true> = await sut.save(parentOrganisation);
                const organisation: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.KLASSE,
                    administriertVon: savedParentOrganisation.id,
                });
                const savedOrganisation: Organisation<true> = await sut.save(organisation);

                const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                    savedOrganisation.id,
                    'newName',
                    1,
                    permissionsMock,
                );
                const expectation: EntityCouldNotBeUpdated = new EntityCouldNotBeUpdated(
                    'Organisation',
                    savedOrganisation.id,
                    ['The schoolName of a Klasse cannot be undefined.'],
                );
                expect(result).toEqual(expectation);
            });
        });

        describe('when organisation is not a Klasse', () => {
            it('should return EntityCouldNotBeUpdated', async () => {
                const parentOrganisation: Organisation<false, false> = DoFactory.createOrganisation(false);
                const savedParentOrganisation: Organisation<true> = await sut.save(parentOrganisation);
                const organisation: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.SONSTIGE,
                    name: 'test',
                    version: faker.number.int(),
                    administriertVon: savedParentOrganisation.id,
                });
                const savedOrganisaiton: Organisation<true> = await sut.save(organisation);
                const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                    savedOrganisaiton.id,
                    faker.company.name(),
                    faker.number.int(),
                    permissionsMock,
                );

                expect(result).toBeInstanceOf(EntityCouldNotBeUpdated);
            });
        });

        describe('when name of organisation is empty', () => {
            it('should return OrganisationSpecificationError', async () => {
                const parentOrganisation: Organisation<false, false> = DoFactory.createOrganisation(false);
                const savedParentOrganisation: Organisation<true> = await sut.save(parentOrganisation);
                const organisation: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.KLASSE,
                    name: 'test',
                    administriertVon: savedParentOrganisation.id,
                });
                const savedOrganisaiton: Organisation<true> = await sut.save(organisation);
                const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                    savedOrganisaiton.id,
                    '',
                    faker.number.int(),
                    permissionsMock,
                );

                expect(result).toBeInstanceOf(OrganisationSpecificationError);
            });
        });

        describe('when all validations are passed', () => {
            it('should update class name and return void', async () => {
                const parentOrga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    typ: OrganisationsTyp.SCHULE,
                    version: 1,
                });
                const organisation: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.KLASSE,
                    name: 'name',
                    administriertVon: parentOrga.id,
                    version: 1,
                });
                const otherChildOrga: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.KLASSE,
                    name: 'nameOther',
                    administriertVon: parentOrga.id,
                    version: 1,
                });

                const organisationEntity1: OrganisationEntity = em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(parentOrga),
                );
                const organisationEntity2: OrganisationEntity = em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(organisation),
                );
                const organisationEntity3: OrganisationEntity = em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(otherChildOrga),
                );
                await em.persist([organisationEntity1, organisationEntity2, organisationEntity3]).flush();
                em.clear();
                const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                    organisationEntity2.id,
                    'newName',
                    1,
                    permissionsMock,
                );

                expect(result).not.toBeInstanceOf(DomainError);
            });
        });

        describe('Should throw an error', () => {
            it('should throw OptimisticLockError when concurrent updates cause version mismatch', async () => {
                // Setup: Create initial organization
                const parentOrga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    typ: OrganisationsTyp.SCHULE,
                    version: 1,
                });
                const organisation: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.KLASSE,
                    name: 'name',
                    administriertVon: parentOrga.id,
                    version: 1,
                });

                // Create and persist entities
                const organisationEntity1: OrganisationEntity = em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(parentOrga),
                );
                const organisationEntity2: OrganisationEntity = em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(organisation),
                );

                await em.persist([organisationEntity1, organisationEntity2]).flush();
                em.clear();

                // Simulate concurrent updates:
                // 1. First update
                await sut.updateOrganisationName(organisationEntity2.id, 'newName1', 1, permissionsMock);

                // 2. Try second update with original version (should fail)
                await expect(async () => {
                    await sut.updateOrganisationName(
                        organisationEntity2.id,
                        'newName2',
                        1, // This is now outdated because previous update incremented it
                        permissionsMock,
                    );
                }).rejects.toThrow(OrganisationUpdateOutdatedError);
            });
        });
        describe('when name did not change', () => {
            it('should not check specifications, update class name and return void', async () => {
                const parentOrga: Organisation<true> = DoFactory.createOrganisationAggregate(true, {
                    typ: OrganisationsTyp.SCHULE,
                    version: 1,
                });
                const organisation: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    typ: OrganisationsTyp.KLASSE,
                    name: 'name',
                    administriertVon: parentOrga.id,
                    version: 1,
                });

                const organisationEntity1: OrganisationEntity = em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(parentOrga),
                );
                const organisationEntity2: OrganisationEntity = em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(organisation),
                );
                await em.persist([organisationEntity1, organisationEntity2]).flush();

                const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                    organisationEntity2.id,
                    'name',
                    1,
                    permissionsMock,
                );

                expect(result).not.toBeInstanceOf(DomainError);
            });
        });
    });

    describe('updateOrganisationName - Schulträger', () => {
        const permissionsMock: IPersonPermissions = createPersonPermissionsMock();

        describe('when organisation is a Schulträger', () => {
            let savedOeffentlich: OrganisationEntity;

            beforeEach(async () => {
                const root: Organisation<true, false> = Organisation.construct<true, false>(
                    sut.ROOT_ORGANISATION_ID,
                    faker.date.past(),
                    faker.date.recent(),
                    1,
                    'Root',
                    OrganisationsTyp.ROOT,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                );

                const oeffentlich: Organisation<false, false> | DomainError = Organisation.createNew(
                    'Öffentliche Schulen Land Schleswig-Holstein',
                    OrganisationsTyp.ROOT,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    undefined,
                    undefined,
                );

                if (oeffentlich instanceof DomainError) {
                    throw oeffentlich;
                }

                const rootEntity: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(root));

                savedOeffentlich = em.create(OrganisationEntity, mapOrgaAggregateToData(oeffentlich));

                await em.persist([rootEntity, savedOeffentlich]).flush();
                em.clear();
            });

            describe('when Schulträger is not a direct child of oeffentlich or ersatz', () => {
                it('should return EntityCouldNotBeUpdated error', async () => {
                    const invalidParent: Organisation<false, false> = DoFactory.createOrganisationAggregate(false, {
                        typ: OrganisationsTyp.SCHULE,
                    });
                    const savedParent: Organisation<true> = await sut.save(invalidParent);

                    const schultraeger: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                        typ: OrganisationsTyp.TRAEGER,
                        zugehoerigZu: savedParent.id ?? '',
                        administriertVon: savedParent.id ?? '',
                    });
                    const savedSchultraeger: Organisation<true> = await sut.save(schultraeger);

                    const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                        savedSchultraeger.id,
                        'newName',
                        1,
                        permissionsMock,
                    );

                    expect(result).toBeInstanceOf(TraegerUnterRootChildError);
                });
            });

            describe('when Schulträger name is not unique', () => {
                it('should return SchultraegerNameEindeutigError', async () => {
                    const name: string = 'Existing Traeger';
                    const existingSchultraeger: Organisation<false, false> = DoFactory.createOrganisationAggregate(
                        false,
                        {
                            typ: OrganisationsTyp.TRAEGER,
                            administriertVon: savedOeffentlich.id,
                            zugehoerigZu: savedOeffentlich.id,
                            name,
                        },
                    );
                    await sut.save(existingSchultraeger);

                    const schultraeger: Organisation<false, false> = DoFactory.createOrganisationAggregate(false, {
                        typ: OrganisationsTyp.TRAEGER,
                        administriertVon: savedOeffentlich.id,
                        zugehoerigZu: savedOeffentlich.id,
                    });
                    const savedSchultraeger: Organisation<true> = await sut.save(schultraeger);

                    const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                        savedSchultraeger.id,
                        name,
                        1,
                        permissionsMock,
                    );

                    expect(result).toBeInstanceOf(SchultraegerNameEindeutigError);
                });
            });

            describe('when all validations are passed', () => {
                it('should update Schulträger under Öffentlich name and return void', async () => {
                    const schultraeger: Organisation<false, false> = DoFactory.createOrganisationAggregate(false, {
                        typ: OrganisationsTyp.TRAEGER,
                        administriertVon: savedOeffentlich.id,
                        zugehoerigZu: savedOeffentlich.id,
                        name: 'OldName',
                    });
                    const savedSchultraeger: Organisation<true> = await sut.save(schultraeger);

                    const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                        savedSchultraeger.id,
                        'NewName',
                        1,
                        permissionsMock,
                    );

                    expect(result).not.toBeInstanceOf(DomainError);
                    expect((result as Organisation<true>).name).toBe('NewName');
                });
            });

            describe('when name did not change', () => {
                it('should not check specifications and return void', async () => {
                    const schultraeger: Organisation<false, false> = DoFactory.createOrganisationAggregate(false, {
                        typ: OrganisationsTyp.TRAEGER,
                        administriertVon: savedOeffentlich.id,
                        name: 'SameName',
                    });
                    const savedSchultraeger: Organisation<true> = await sut.save(schultraeger);

                    const result: DomainError | Organisation<true> = await sut.updateOrganisationName(
                        savedSchultraeger.id,
                        'SameName',
                        1,
                        permissionsMock,
                    );

                    expect(result).not.toBeInstanceOf(DomainError);
                    expect((result as Organisation<true>).name).toBe('SameName');
                });
            });
        });
    });

    describe('setEnabledForitslearning', () => {
        it('should enable organisation for itslearning', async () => {
            const orga: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.SCHULE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                faker.string.numeric(6),
                undefined,
                undefined,
            );
            if (orga instanceof DomainError) {
                throw orga;
            }

            const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
            await em.persist(mappedOrga).flush();

            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const result: Organisation<true> | DomainError = await sut.setEnabledForitslearning(
                personPermissions,
                mappedOrga.id,
            );
            if (result instanceof DomainError) {
                throw Error();
            }

            expect(result.itslearningEnabled).toBeTruthy();
        });

        it('should return error if permissions are not sufficient to edit organisation', async () => {
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.hasSystemrechteAtRootOrganisation.mockResolvedValue(false);

            const fakeId: string = faker.string.uuid();
            const result: Organisation<true> | DomainError = await sut.setEnabledForitslearning(
                personPermissions,
                fakeId,
            );

            expect(result).toStrictEqual(new EntityNotFoundError('Organisation', fakeId));
        });

        it('should throw error if organisation CANNOT be found by id', async () => {
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);

            const fakeId: string = faker.string.uuid();
            const result: Organisation<true> | DomainError = await sut.setEnabledForitslearning(
                personPermissions,
                fakeId,
            );

            expect(result).toStrictEqual(new EntityNotFoundError('Organisation', fakeId));
        });

        it('should return error if organisation-typ is NOT Schule', async () => {
            const orga: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.KLASSE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                faker.string.numeric(6),
                undefined,
                undefined,
            );
            if (orga instanceof DomainError) {
                return;
            }
            const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
            await em.persist(mappedOrga).flush();

            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });
            personPermissions.hasSystemrechteAtRootOrganisation.mockResolvedValue(true);

            const result: Organisation<true> | DomainError = await sut.setEnabledForitslearning(
                personPermissions,
                mappedOrga.id,
            );

            expect(result).toStrictEqual(
                new EntityCouldNotBeUpdated('Organisation', mappedOrga.id, [
                    'Only organisations of typ SCHULE can be enabled for ITSLearning.',
                ]),
            );
        });
    });

    describe('findByNameOrKennung', () => {
        let organisations: Organisation<false, false>[];

        beforeEach(async () => {
            organisations = [
                DoFactory.createOrganisationAggregate(false, {
                    name: 'TestName1',
                    kennung: 'KENNUNG1',
                }),
                DoFactory.createOrganisationAggregate(false, { name: 'AnotherTest', kennung: 'KENNUNG2' }),
                DoFactory.createOrganisationAggregate(false, { name: 'TestName2', kennung: 'DIFFERENTKENNUNG' }),
            ];
            /* eslint-disable no-await-in-loop */
            for (const organisation of organisations) {
                await sut.save(organisation);
            }
            /* eslint-disable no-await-in-loop */
        });

        it('should return organisations that match the search string in name', async () => {
            const result: Organisation<true>[] = await sut.findByNameOrKennung('TestName');
            expect(result).toHaveLength(2);
            expect(result.some((org: Organisation<true>) => org.name === 'TestName1')).toBeTruthy();
            expect(result.some((org: Organisation<true>) => org.name === 'TestName2')).toBeTruthy();
        });

        it('should return organisations that match the search string in kennung', async () => {
            const result: Organisation<true>[] = await sut.findByNameOrKennung('KENNUNG2');
            expect(result).toHaveLength(1);
            expect(result[0]?.kennung).toEqual('KENNUNG2');
        });

        it('should return organisations that match the search string in either name or kennung', async () => {
            const result: Organisation<true>[] = await sut.findByNameOrKennung('AnotherTest');
            expect(result).toHaveLength(1);
            expect(result[0]?.name).toEqual('AnotherTest');
        });

        it('should return an empty array if no organisations match the search string', async () => {
            const result: Organisation<true>[] = await sut.findByNameOrKennung('NoMatch');
            expect(result).toHaveLength(0);
        });
    });

    describe('Save', () => {
        let root: Organisation<false, false>;
        let oeffentlich: Organisation<false, false>;
        let ersatz: Organisation<false, false>;
        let organisationEntity1: OrganisationEntity;
        let organisationEntity2: OrganisationEntity;
        let organisationEntity3: OrganisationEntity;

        beforeEach(async () => {
            root = Organisation.construct(
                ROOT_ORGANISATION_ID,
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                'Root',
                OrganisationsTyp.SCHULE,
                undefined,
                faker.string.uuid(),
                faker.string.uuid(),
                faker.string.numeric(),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );

            oeffentlich = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                'Öffentliche Schulen Land Schleswig-Holstein',
                OrganisationsTyp.ROOT,
                undefined,
                ROOT_ORGANISATION_ID,
                faker.string.uuid(),
                faker.string.numeric(),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );

            ersatz = Organisation.construct(
                faker.string.uuid(),
                faker.date.past(),
                faker.date.recent(),
                faker.number.int(),
                'Ersatzschulen Land Schleswig-Holstein',
                OrganisationsTyp.SCHULE,
                undefined,
                ROOT_ORGANISATION_ID,
                faker.string.uuid(),
                faker.string.numeric(),
                faker.lorem.word(),
                faker.string.uuid(),
                undefined,
            );

            organisationEntity1 = em.create(OrganisationEntity, mapOrgaAggregateToData(root));
            organisationEntity2 = em.create(OrganisationEntity, mapOrgaAggregateToData(oeffentlich));
            organisationEntity3 = em.create(OrganisationEntity, mapOrgaAggregateToData(ersatz));

            await em.persist([organisationEntity1, organisationEntity2, organisationEntity3]).flush();
        });

        describe('When create is called', () => {
            it('should set oeffentlich as OrganisationsBaumZuordnung successfully', async () => {
                const schule: Organisation<false, false> = DoFactory.createOrganisationAggregate(false, {
                    administriertVon: organisationEntity2.id,
                    typ: OrganisationsTyp.SCHULE,
                });
                const result: Organisation<true> = await sut.save(schule);

                expect(result).toBeInstanceOf(Organisation);
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        organisationId: result.id,
                        kennung: result.kennung,
                        name: result.name,
                        rootDirectChildrenZuordnung: RootDirectChildrenType.OEFFENTLICH,
                    }),
                    expect.objectContaining({
                        organisationId: result.id,
                        kennung: result.kennung,
                        name: result.name,
                        rootDirectChildrenZuordnung: RootDirectChildrenType.OEFFENTLICH,
                    }),
                );
            });

            it('should set ersatz as OrganisationsBaumZuordnung successfully', async () => {
                const traeger: Organisation<true, false> = await sut.save(
                    DoFactory.createOrganisationAggregate(false, {
                        administriertVon: organisationEntity3.id,
                        typ: OrganisationsTyp.TRAEGER,
                    }),
                );
                const schule: Organisation<false> = DoFactory.createOrganisationAggregate(false, {
                    administriertVon: traeger.id,
                    typ: OrganisationsTyp.SCHULE,
                });
                const result: Organisation<true> = await sut.save(schule);

                expect(result).toBeInstanceOf(Organisation);
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        organisationId: result.id,
                        name: result.name,
                        kennung: result.kennung,
                        rootDirectChildrenZuordnung: RootDirectChildrenType.ERSATZ,
                    }),
                    expect.objectContaining({
                        organisationId: result.id,
                        name: result.name,
                        kennung: result.kennung,
                        rootDirectChildrenZuordnung: RootDirectChildrenType.ERSATZ,
                    }),
                );
            });

            it('should set oeffentlich as OrganisationsBaumZuordnung per default successfully', async () => {
                const result: Organisation<true, false> = await sut.save(
                    DoFactory.createOrganisationAggregate(false, {
                        administriertVon: undefined,
                        typ: OrganisationsTyp.SCHULE,
                    }),
                );

                expect(result).toBeInstanceOf(Organisation);
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining({
                        organisationId: result.id,
                        kennung: result.kennung,
                        name: result.name,
                        rootDirectChildrenZuordnung: RootDirectChildrenType.OEFFENTLICH,
                    }),
                    expect.objectContaining({
                        organisationId: result.id,
                        kennung: result.kennung,
                        name: result.name,
                        rootDirectChildrenZuordnung: RootDirectChildrenType.OEFFENTLICH,
                    }),
                );
            });
        });

        describe('When update is called for a Schule', () => {
            it('should publish SchuleUpdatedEvent successfully', async () => {
                const savedSchule: Organisation<true, false> = await sut.save(
                    DoFactory.createOrganisationAggregate(false, {
                        administriertVon: organisationEntity2.id,
                        zugehoerigZu: organisationEntity2.id,
                        typ: OrganisationsTyp.SCHULE,
                        kennung: '1234567',
                        name: 'Alte Schule',
                    }),
                );
                eventServiceMock.publish.mockClear();

                savedSchule.kennung = '7654321';
                savedSchule.name = 'Neue Schule';
                savedSchule.zugehoerigZu = organisationEntity3.id;

                const result: Organisation<true> = await sut.save(savedSchule);

                expect(result).toBeInstanceOf(Organisation);
                expect(eventServiceMock.publish).toHaveBeenCalledWith(
                    expect.objectContaining<Partial<SchuleUpdatedEvent>>({
                        organisationId: result.id,
                        kennung: '7654321',
                        name: 'Neue Schule',
                        itslearningEnabled: result.itslearningEnabled,
                        oldKennung: '1234567',
                        oldName: 'Alte Schule',
                        oldZugehoerigZu: organisationEntity2.id,
                        zugehoerigZu: organisationEntity3.id,
                    }),
                    expect.objectContaining<Partial<KafkaSchuleUpdatedEvent>>({
                        organisationId: result.id,
                        kennung: '7654321',
                        name: 'Neue Schule',
                        itslearningEnabled: result.itslearningEnabled,
                        oldKennung: '1234567',
                        oldName: 'Alte Schule',
                        oldZugehoerigZu: organisationEntity2.id,
                        zugehoerigZu: organisationEntity3.id,
                    }),
                );
            });
        });
    });

    describe('isOrgaAParentOfOrgaB', () => {
        it('should return true if A is parent of B', async () => {
            const orgaA: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.SCHULE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                faker.string.numeric(6),
            );
            if (orgaA instanceof DomainError) {
                return;
            }
            const mappedOrgaA: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orgaA));
            await em.persist(mappedOrgaA).flush();
            const orgaB: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.SCHULE,
                mappedOrgaA.id,
                mappedOrgaA.id,
                faker.string.numeric(6),
            );
            if (orgaB instanceof DomainError) {
                return;
            }
            const mappedOrgaB: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orgaB));
            await em.persist(mappedOrgaB).flush();

            await expect(sut.isOrgaAParentOfOrgaB(mappedOrgaA.id, mappedOrgaB.id)).resolves.toBe(true);
        });

        it('should return false if A is not parent of B', async () => {
            const orgaA: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.SCHULE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                faker.string.numeric(6),
            );
            if (orgaA instanceof DomainError) {
                return;
            }
            const mappedOrgaA: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orgaA));
            await em.persist(mappedOrgaA).flush();
            const orgaB: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.SCHULE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                faker.string.numeric(6),
            );
            if (orgaB instanceof DomainError) {
                return;
            }
            const mappedOrgaB: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orgaB));
            await em.persist(mappedOrgaB).flush();

            await expect(sut.isOrgaAParentOfOrgaB(mappedOrgaA.id, mappedOrgaB.id)).resolves.toBe(false);
        });
    });

    describe('findAuthorized', () => {
        it('should return all organisations for root', async () => {
            const orgas: OrganisationEntity[] = [];
            for (let i: number = 0; i < 5; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                {},
            );

            expect(result[1]).toBe(5);
        });

        it('should return no organisations if not authorized', async () => {
            const orgas: OrganisationEntity[] = [];
            for (let i: number = 0; i < 5; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: false, orgaIds: [] });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                {},
            );

            expect(result[1]).toBe(0);
        });

        describe.each([[true], [false]])('with matchAllSystemrechte = %s', (matchAllSystemrechte: boolean) => {
            it('should return all authorized organisations according to list', async () => {
                const orgas: OrganisationEntity[] = [];
                for (let i: number = 0; i < 5; i++) {
                    const orga: Organisation<false> | DomainError = Organisation.createNew(
                        faker.company.name(),
                        OrganisationsTyp.SCHULE,
                        sut.ROOT_ORGANISATION_ID,
                        sut.ROOT_ORGANISATION_ID,
                        faker.string.numeric(6),
                    );
                    if (orga instanceof DomainError) {
                        return;
                    }
                    const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                    await em.persist(mappedOrga).flush();
                    orgas.push(mappedOrga);
                }
                const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                    all: false,
                    orgaIds: [orgas[0]!.id, orgas[3]!.id, orgas[4]!.id],
                });

                const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                    personPermissions,
                    [RollenSystemRecht.SCHULEN_VERWALTEN],
                    { matchAllSystemrechte },
                );

                expect(personPermissions.getOrgIdsWithSystemrecht).toHaveBeenLastCalledWith(
                    [RollenSystemRecht.SCHULEN_VERWALTEN],
                    true,
                    matchAllSystemrechte,
                );
                expect(result[1]).toBe(3);
                expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
                expect(result[0].some((org: Organisation<true>) => org.id === orgas[3]!.id)).toBeTruthy();
                expect(result[0].some((org: Organisation<true>) => org.id === orgas[4]!.id)).toBeTruthy();
            });
        });

        it('should return all authorized organisations for searchString in name', async () => {
            const orgas: OrganisationEntity[] = [];
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    'Test' + faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orgas[0]!.id, orgas[2]!.id, orgas[4]!.id],
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { searchString: 'Test' },
            );

            expect(result[1]).toBe(2);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[2]!.id)).toBeTruthy();
        });

        it('should return all authorized organisations for searchString in kennung', async () => {
            const orgas: OrganisationEntity[] = [];
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    '1234567',
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orgas[0]!.id, orgas[2]!.id, orgas[4]!.id],
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { searchString: '23456' },
            );

            expect(result[1]).toBe(2);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[2]!.id)).toBeTruthy();
        });

        it('should return all authorized organisations with correct kennung and name', async () => {
            const orgas: OrganisationEntity[] = [];
            const orgaToFind: Organisation<false> | DomainError = Organisation.createNew(
                'dummy-name',
                OrganisationsTyp.SCHULE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                'dummy-kennung',
            );
            if (orgaToFind instanceof DomainError) {
                return;
            }
            const mappedOrgaToFind: OrganisationEntity = em.create(
                OrganisationEntity,
                mapOrgaAggregateToData(orgaToFind),
            );
            await em.persist(mappedOrgaToFind).flush();
            orgas.push(mappedOrgaToFind);

            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { kennung: 'dummy-kennung', name: 'dummy-name' },
            );

            expect(result[1]).toBe(1);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
        });

        it('should return all authorized organisations with given ID even though other criteria are not met', async () => {
            const orgas: OrganisationEntity[] = [];
            const orgaToFind: Organisation<false> | DomainError = Organisation.createNew(
                'dummy-name',
                OrganisationsTyp.SCHULE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                'dummy-kennung',
            );
            if (orgaToFind instanceof DomainError) {
                return;
            }
            const mappedOrgaToFind: OrganisationEntity = em.create(
                OrganisationEntity,
                mapOrgaAggregateToData(orgaToFind),
            );
            await em.persist(mappedOrgaToFind).flush();
            orgas.push(mappedOrgaToFind);

            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { kennung: 'dummy-kennung', name: 'dummy-name', organisationIds: [orgas[1]!.id] },
            );

            expect(result[1]).toBe(2);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[1]!.id)).toBeTruthy();
        });

        it('should not return Orgas for ID without permission', async () => {
            const orgas: OrganisationEntity[] = [];
            const orgaToFind: Organisation<false> | DomainError = Organisation.createNew(
                'dummy-name',
                OrganisationsTyp.SCHULE,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                'dummy-kennung',
            );
            if (orgaToFind instanceof DomainError) {
                return;
            }
            const mappedOrgaToFind: OrganisationEntity = em.create(
                OrganisationEntity,
                mapOrgaAggregateToData(orgaToFind),
            );
            await em.persist(mappedOrgaToFind).flush();
            orgas.push(mappedOrgaToFind);

            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    'Test' + faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orgas[0]!.id, orgas[1]!.id],
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { kennung: 'dummy-kennung', name: 'dummy-name', organisationIds: [orgas[1]!.id, orgas[2]!.id] },
            );

            expect(result[1]).toBe(2);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[1]!.id)).toBeTruthy();
        });

        it('should merge results of organistations for IDs an other organisations correctly', async () => {
            const orgas: OrganisationEntity[] = [];

            for (let i: number = 0; i < 5; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    'dummy-name',
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    'dummy-kennung',
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }

            for (let i: number = 0; i < 5; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                {
                    kennung: 'dummy-kennung',
                    name: 'dummy-name',
                    organisationIds: [orgas[1]!.id, orgas[7]!.id, orgas[8]!.id],
                    limit: 5,
                },
            );

            expect(result[1]).toBe(7);
            expect(result[0].length).toBe(5);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[1]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[7]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[8]!.id)).toBeTruthy();
        });

        it('should return all authorized organisations with correct type and parent under administriertVon', async () => {
            const orgas: OrganisationEntity[] = [];
            const orgaLand: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.LAND,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                '',
                'Öffentliche Schulen Land Schleswig-Holstein',
                undefined,
                undefined,
            );
            if (orgaLand instanceof DomainError) {
                return;
            }
            const mappedOrgaLand: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orgaLand));
            await em.persist(mappedOrgaLand).flush();
            orgas.push(mappedOrgaLand);

            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    mappedOrgaLand.id,
                    mappedOrgaLand.id,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Schule under Land');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.TRAEGER,
                    mappedOrgaLand.id,
                    mappedOrgaLand.id,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Traeger');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Schule under root');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { administriertVon: [mappedOrgaLand.id], typ: OrganisationsTyp.SCHULE },
            );

            expect(result[1]).toBe(3);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[1]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[2]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[3]!.id)).toBeTruthy();
        });

        it('should return all authorized organisations with correct type and parent under administriertVon with Recursion', async () => {
            const orgas: Organisation<true>[] = [];
            const orgaLand: Organisation<true, false> = await sut.save(
                DoFactory.createOrganisation(false, {
                    administriertVon: sut.ROOT_ORGANISATION_ID,
                    typ: OrganisationsTyp.LAND,
                }),
            );
            orgas.push(orgaLand);

            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<true, false> = await sut.save(
                    DoFactory.createOrganisation(false, {
                        administriertVon: orgaLand.id,
                        typ: OrganisationsTyp.SCHULE,
                    }),
                );
                orgas.push(orga);
            }

            const orgaTraeger: Organisation<true, false> = await sut.save(
                DoFactory.createOrganisation(false, {
                    administriertVon: orgaLand.id,
                    typ: OrganisationsTyp.TRAEGER,
                }),
            );
            orgas.push(orgaTraeger);

            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<true, false> = await sut.save(
                    DoFactory.createOrganisation(false, {
                        administriertVon: orgaTraeger.id,
                        typ: OrganisationsTyp.SCHULE,
                    }),
                );
                orgas.push(orga);
            }

            // Land and Schulen that should not be fetched
            const orgaLand2: Organisation<true, false> = await sut.save(
                DoFactory.createOrganisation(false, {
                    administriertVon: sut.ROOT_ORGANISATION_ID,
                    typ: OrganisationsTyp.LAND,
                }),
            );
            orgas.push(orgaLand2);
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<true, false> = await sut.save(
                    DoFactory.createOrganisation(false, {
                        administriertVon: orgaLand2.id,
                        typ: OrganisationsTyp.SCHULE,
                    }),
                );
                orgas.push(orga);
            }

            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { administriertVon: [orgaLand.id], typ: OrganisationsTyp.SCHULE, getChildrenRecursively: true },
            );

            expect(result[1]).toBe(6);
            expect(result[0]).toContainEqual(expect.objectContaining({ id: orgas[1]!.id }));
            expect(result[0]).toContainEqual(expect.objectContaining({ id: orgas[2]!.id }));
            expect(result[0]).toContainEqual(expect.objectContaining({ id: orgas[3]!.id }));
            expect(result[0]).toContainEqual(expect.objectContaining({ id: orgas[5]!.id }));
            expect(result[0]).toContainEqual(expect.objectContaining({ id: orgas[6]!.id }));
            expect(result[0]).toContainEqual(expect.objectContaining({ id: orgas[7]!.id }));
            expect(result[0]).not.toContainEqual(expect.objectContaining({ id: orgas[8]!.id }));
            expect(result[0]).not.toContainEqual(expect.objectContaining({ id: orgas[9]!.id }));
            expect(result[0]).not.toContainEqual(expect.objectContaining({ id: orgas[10]!.id }));
            expect(result[0]).not.toContainEqual(expect.objectContaining({ id: orgas[11]!.id }));
        });

        it('should return all authorized organisations with correct type and parent under zugehoerig zu', async () => {
            const orgas: OrganisationEntity[] = [];
            const orgaLand: Organisation<false> | DomainError = Organisation.createNew(
                faker.company.name(),
                OrganisationsTyp.LAND,
                sut.ROOT_ORGANISATION_ID,
                sut.ROOT_ORGANISATION_ID,
                '',
                'Öffentliche Schulen Land Schleswig-Holstein',
                undefined,
                undefined,
            );
            if (orgaLand instanceof DomainError) {
                return;
            }
            const mappedOrgaLand: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orgaLand));
            await em.persist(mappedOrgaLand).flush();
            orgas.push(mappedOrgaLand);

            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    mappedOrgaLand.id,
                    mappedOrgaLand.id,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Schule under Land');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.TRAEGER,
                    mappedOrgaLand.id,
                    mappedOrgaLand.id,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Traeger');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Schule under root');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: true,
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { zugehoerigZu: [mappedOrgaLand.id], typ: OrganisationsTyp.SCHULE },
            );

            expect(result[1]).toBe(3);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[1]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[2]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[3]!.id)).toBeTruthy();
        });

        it('should exclude type', async () => {
            const orgas: OrganisationEntity[] = [];
            for (let i: number = 0; i < 2; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Schule under Land');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 2; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.TRAEGER,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Traeger');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 2; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.KLASSE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                    undefined,
                    undefined,
                );
                if (orga instanceof DomainError) {
                    throw new Error('could not create Klasse');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orgas[0]!.id, orgas[2]!.id, orgas[3]!.id, orgas[4]!.id],
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { excludeTyp: [OrganisationsTyp.KLASSE] },
            );

            expect(result[1]).toBe(3);
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[0]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[2]!.id)).toBeTruthy();
            expect(result[0].some((org: Organisation<true>) => org.id === orgas[3]!.id)).toBeTruthy();
        });

        it('should return correct pageTotal for root user without searchString', async () => {
            const orgas: OrganisationEntity[] = [];
            for (let i: number = 0; i < 5; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { limit: 3 }, // Simulate a limit for pagination
            );

            expect(result[1]).toBe(5); // total should be 5
            expect(result[2]).toBe(3); // pageTotal should be 3 because of the limit
        });

        it('should return correct pageTotal when searchString is used', async () => {
            const orgas: OrganisationEntity[] = [];
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    'Test' + faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            for (let i: number = 0; i < 3; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    return;
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                orgas.push(mappedOrga);
            }
            const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({
                all: false,
                orgaIds: [orgas[0]!.id, orgas[2]!.id, orgas[4]!.id],
            });

            const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                personPermissions,
                [RollenSystemRecht.SCHULEN_VERWALTEN],
                { searchString: 'Test' },
            );

            expect(result[1]).toBe(2); // total matched organisations
            expect(result[2]).toBe(2); // pageTotal should also be 2 since it's less than the limit
        });

        describe('Sorting', () => {
            let organisations: OrganisationEntity[] = [];
            beforeEach(async () => {
                organisations = [];
                for (let i: number = 0; i < 5; i++) {
                    const orga: Organisation<false> | DomainError = Organisation.createNew(
                        `Organisation ${5 - i}`, // Reverse order for testing sorting
                        OrganisationsTyp.SCHULE,
                        sut.ROOT_ORGANISATION_ID,
                        sut.ROOT_ORGANISATION_ID,
                        faker.string.numeric(6),
                    );
                    if (orga instanceof DomainError) {
                        throw new Error('Could not create Organisation');
                    }
                    const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                    await em.persist(mappedOrga).flush();
                    organisations.push(mappedOrga);
                }
            });

            it('should return organisations sorted by name in ascending order', async () => {
                const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

                const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                    personPermissions,
                    [RollenSystemRecht.SCHULEN_VERWALTEN],
                    { sortField: SortFieldOrganisation.NAME, sortOrder: ScopeOrder.ASC },
                );

                expect(result[0].map((org: Organisation<true>) => org.name)).toEqual(
                    organisations.map((org: OrganisationEntity) => org.name).sort(),
                );
            });

            it('should return organisations sorted by name in descending order', async () => {
                const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

                const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                    personPermissions,
                    [RollenSystemRecht.SCHULEN_VERWALTEN],
                    { sortField: SortFieldOrganisation.NAME, sortOrder: ScopeOrder.DESC },
                );

                expect(result[0].map((org: Organisation<true>) => org.name)).toEqual(
                    organisations
                        .map((org: OrganisationEntity) => org.name)
                        .sort()
                        .reverse(),
                );
            });

            it('should return organisations sorted by kennung in ascending order', async () => {
                const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

                const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                    personPermissions,
                    [RollenSystemRecht.SCHULEN_VERWALTEN],
                    { sortField: SortFieldOrganisation.KENNUNG, sortOrder: ScopeOrder.ASC },
                );

                expect(result[0].map((org: Organisation<true>) => org.kennung)).toEqual(
                    organisations.map((org: OrganisationEntity) => org.kennung).sort(),
                );
            });

            it('should return organisations sorted by kennung in descending order', async () => {
                const personPermissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                personPermissions.getOrgIdsWithSystemrecht.mockResolvedValue({ all: true });

                const result: [Organisation<true>[], number, number] = await sut.findAuthorized(
                    personPermissions,
                    [RollenSystemRecht.SCHULEN_VERWALTEN],
                    { sortField: SortFieldOrganisation.KENNUNG, sortOrder: ScopeOrder.DESC },
                );

                expect(result[0].map((org: Organisation<true>) => org.kennung)).toEqual(
                    organisations
                        .map((org: OrganisationEntity) => org.kennung)
                        .sort()
                        .reverse(),
                );
            });
        });
    });

    describe('findByNameOrKennungAndExcludeByOrganisationType', () => {
        it('should only return organisations with the permitted IDs', async () => {
            const organisations: OrganisationEntity[] = [];

            // Create 5 organisations
            for (let i: number = 0; i < 5; i++) {
                const orga: Organisation<false> | DomainError = Organisation.createNew(
                    faker.company.name(),
                    OrganisationsTyp.SCHULE,
                    sut.ROOT_ORGANISATION_ID,
                    sut.ROOT_ORGANISATION_ID,
                    faker.string.numeric(6),
                );
                if (orga instanceof DomainError) {
                    throw new Error('Could not create Organisation');
                }
                const mappedOrga: OrganisationEntity = em.create(OrganisationEntity, mapOrgaAggregateToData(orga));
                await em.persist(mappedOrga).flush();
                organisations.push(mappedOrga);
            }

            organisations.filter((orga: OrganisationEntity): orga is OrganisationEntity => orga !== undefined);

            // Only permit the first and third organisation
            const permittedOrgaIds: string[] = [organisations[0]?.id, organisations[2]?.id].filter(
                (id: string | undefined): id is string => !!id,
            );

            const finalOrgas: Organisation<true>[] = [];

            for (const orga of organisations) {
                const orgaAggregate: Organisation<true> = mapOrgaEntityToAggregate(orga);
                finalOrgas.push(orgaAggregate);
            }

            vi.spyOn(sut, 'findBy').mockResolvedValueOnce([
                finalOrgas.filter((orga: Organisation<true>) => permittedOrgaIds.includes(orga.id)),
                2,
            ]);

            if (permittedOrgaIds && permittedOrgaIds.length > 0) {
                // Call the method with permitted organisation IDs
                const result: Organisation<true>[] = await sut.findByNameOrKennungAndExcludeByOrganisationType(
                    OrganisationsTyp.KLASSE, // Exclude some type, not relevant here
                    undefined,
                    permittedOrgaIds,
                    25,
                );

                // Verify the result contains only the permitted organisations
                expect(result.length).toBe(2);
                expect(result.some((org: Organisation<true>) => org.id === organisations[0]?.id)).toBeTruthy();
                expect(result.some((org: Organisation<true>) => org.id === organisations[2]?.id)).toBeTruthy();
            }
        });
    });

    describe('delete', () => {
        describe('when organisation can be found', () => {
            it('should succeed', async () => {
                const orga: OrganisationEntity = Object.assign(
                    new OrganisationEntity(),
                    DoFactory.createOrganisation<true>(true),
                );
                await em.persist(orga).flush();
                const result: void | DomainError = await sut.delete(orga.id);
                expect(result).not.toBeInstanceOf(EntityNotFoundError);
                await expect(em.findOneOrFail(OrganisationEntity, { id: orga.id })).rejects.toThrow();
                expect(eventServiceMock.publish).toHaveBeenCalled();
            });
        });

        describe('when organisation can not be found', () => {
            it('should return an error', async () => {
                const id: string = faker.string.uuid();
                const result: void | DomainError = await sut.delete(id);
                expect(result).toBeInstanceOf(EntityNotFoundError);
                expect(eventServiceMock.publish).not.toHaveBeenCalled();
            });
        });
    });

    describe('findDistinctOrganisationsTypen', () => {
        describe.each([[0], [2]])('when filter contains %s ids', (numberOfIds: number) => {
            it('should return the correct organisation types', async () => {
                const organisationIds: OrganisationID[] = Array.from({ length: numberOfIds }, () =>
                    faker.string.uuid(),
                );

                const orgas: OrganisationEntity[] = organisationIds.map((orgaId: OrganisationID) => {
                    return Object.assign(
                        new OrganisationEntity(),
                        DoFactory.createOrganisation<true>(true, {
                            id: orgaId,
                        }),
                    );
                });

                await em.persist(orgas).flush();

                const expectedTypen: Set<OrganisationsTyp> = new Set(
                    orgas.map((organisation: OrganisationEntity) => organisation.typ),
                );

                const result: OrganisationsTyp[] = await sut.findDistinctOrganisationsTypen(organisationIds);

                expect(result).toHaveLength(expectedTypen.size);
                expect(result).toEqual(expect.arrayContaining(Array.from(expectedTypen)));
            });
        });
    });

    describe('findIdsByTypen', () => {
        describe('when no types are provided', () => {
            it('should return empty array', async () => {
                const result: OrganisationID[] = await sut.findIdsByTypen([]);

                expect(result).toEqual([]);
            });
        });

        describe('when types are provided', () => {
            const setup = async (): Promise<{
                schule: OrganisationEntity;
                traeger: OrganisationEntity;
                klasse: OrganisationEntity;
            }> => {
                const schule: OrganisationEntity = Object.assign(
                    new OrganisationEntity(),
                    DoFactory.createOrganisation<true>(true, { typ: OrganisationsTyp.SCHULE }),
                );
                const traeger: OrganisationEntity = Object.assign(
                    new OrganisationEntity(),
                    DoFactory.createOrganisation<true>(true, { typ: OrganisationsTyp.TRAEGER }),
                );
                const klasse: OrganisationEntity = Object.assign(
                    new OrganisationEntity(),
                    DoFactory.createOrganisation<true>(true, { typ: OrganisationsTyp.KLASSE }),
                );
                await em.persist([schule, traeger, klasse]).flush();
                em.clear();

                return { schule, traeger, klasse };
            };

            it('should return ids of organisations matching the given type', async () => {
                const { schule, traeger }: { schule: OrganisationEntity; traeger: OrganisationEntity } = await setup();

                const result: OrganisationID[] = await sut.findIdsByTypen([OrganisationsTyp.SCHULE]);

                expect(result).toContain(schule.id);
                expect(result).not.toContain(traeger.id);
            });

            it('should return ids for multiple types', async () => {
                const {
                    schule,
                    traeger,
                    klasse,
                }: { schule: OrganisationEntity; traeger: OrganisationEntity; klasse: OrganisationEntity } =
                    await setup();

                const result: OrganisationID[] = await sut.findIdsByTypen([
                    OrganisationsTyp.SCHULE,
                    OrganisationsTyp.TRAEGER,
                ]);

                expect(result).toContain(schule.id);
                expect(result).toContain(traeger.id);
                expect(result).not.toContain(klasse.id);
            });

            it('should return empty array when no organisations match the given type', async () => {
                const { klasse }: { klasse: OrganisationEntity } = await setup();

                const result: OrganisationID[] = await sut.findIdsByTypen([OrganisationsTyp.SCHULE]);

                expect(result).not.toContain(klasse.id);
            });
        });
    });

    describe('createOrganisationsbeziehung', () => {
        it('should persist and return an Organisationsbeziehung', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const organisationsbeziehung: Organisationsbeziehung<false> = {
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            };

            const result: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung(organisationsbeziehung);

            expect(result.id).toBeDefined();
            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.updatedAt).toBeInstanceOf(Date);
            expect(result.quellOrganisationId).toBe(quellOrganisation.id);
            expect(result.zielOrganisationId).toBe(zielOrganisation.id);
            expect(result.typ).toBe(OrganisationsbeziehungsTyp.SCHULTRAEGER);

            const persistedEntity: OrganisationsbeziehungEntity | null = await em.findOne(
                OrganisationsbeziehungEntity,
                result.id,
            );

            expect(persistedEntity).not.toBeNull();
            expect(persistedEntity?.quellOrganisationId).toBe(quellOrganisation.id);
            expect(persistedEntity?.zielOrganisationId).toBe(zielOrganisation.id);
            expect(persistedEntity?.typ).toBe(OrganisationsbeziehungsTyp.SCHULTRAEGER);
        });

        it('should create a relationship of type SCHULAUFSICHT', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const organisationsbeziehung: Organisationsbeziehung<false> = {
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULAUFSICHT,
            };

            const result: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung(organisationsbeziehung);

            expect(result.typ).toBe(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        });

        it('should reject a relationship if the source organisation does not exist', async () => {
            const zielOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const organisationsbeziehung: Organisationsbeziehung<false> = {
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: faker.string.uuid(),
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            };

            await expect(sut.createOrganisationsbeziehung(organisationsbeziehung)).rejects.toThrow();
        });

        it('should reject a relationship if the target organisation does not exist', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const organisationsbeziehung: Organisationsbeziehung<false> = {
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: faker.string.uuid(),
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            };

            await expect(sut.createOrganisationsbeziehung(organisationsbeziehung)).rejects.toThrow();
        });
    });

    describe('deleteOrganisationsbeziehung', () => {
        it('should delete the Organisationsbeziehung with the specified ID', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const created: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung({
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            });

            await sut.deleteOrganisationsbeziehung(created.id);

            const result: Option<Organisationsbeziehung<true>> = await sut.findOrganisationsbeziehungById(created.id);

            expect(result).toBeUndefined();
        });

        it('should only delete the Organisationsbeziehung with the specified ID', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisationA: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisationB: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const relationshipToDelete: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung({
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisationA.id,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            });

            const relationshipToKeep: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung({
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisationB.id,
                typ: OrganisationsbeziehungsTyp.SCHULAUFSICHT,
            });

            await sut.deleteOrganisationsbeziehung(relationshipToDelete.id);

            const deleted: Option<Organisationsbeziehung<true>> = await sut.findOrganisationsbeziehungById(
                relationshipToDelete.id,
            );

            const remaining: Option<Organisationsbeziehung<true>> = await sut.findOrganisationsbeziehungById(
                relationshipToKeep.id,
            );

            expect(deleted).toBeUndefined();
            expect(remaining).toEqual(relationshipToKeep);
        });

        it('should resolve without an error if the Organisationsbeziehung does not exist', async () => {
            await expect(sut.deleteOrganisationsbeziehung(faker.string.uuid())).resolves.toBeUndefined();
        });
    });

    describe('findOrganisationsbeziehungById', () => {
        it('should return an Organisationsbeziehung by id', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const created: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung({
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            });

            const result: Option<Organisationsbeziehung<true>> = await sut.findOrganisationsbeziehungById(created.id);

            expect(result).toEqual(created);
        });

        it('should return undefined if the Organisationsbeziehung does not exist', async () => {
            const result: Option<Organisationsbeziehung<true>> = await sut.findOrganisationsbeziehungById(
                faker.string.uuid(),
            );

            expect(result).toBeUndefined();
        });
    });

    describe('findByIdWithRelationships', () => {
        it('should return the organisation with its outgoing relationships', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisationA: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisationB: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const relationshipA: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung({
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisationA.id,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            });

            const relationshipB: Organisationsbeziehung<true> = await sut.createOrganisationsbeziehung({
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisationB.id,
                typ: OrganisationsbeziehungsTyp.SCHULAUFSICHT,
            });

            const result: Option<Organisation<true, true>> = await sut.findByIdWithRelationships(quellOrganisation.id);

            expect(result).toBeDefined();
            expect(result?.id).toBe(quellOrganisation.id);
            expect(result?.organisationsbeziehungen).toHaveLength(2);

            expect(result?.organisationsbeziehungen).toEqual(expect.arrayContaining([relationshipA, relationshipB]));
        });

        it('should return the organisation with an empty relationship array', async () => {
            const organisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const result: Option<Organisation<true, true>> = await sut.findByIdWithRelationships(organisation.id);

            expect(result).toBeDefined();
            expect(result?.id).toBe(organisation.id);
            expect(result?.organisationsbeziehungen).toEqual([]);
        });

        it('should only load relationships for which the organisation is the source', async () => {
            const quellOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            const zielOrganisation: Organisation<true, false> = await createPersistedOrganisation(
                OrganisationsTyp.SONSTIGE,
            );

            await sut.createOrganisationsbeziehung({
                id: undefined,
                createdAt: undefined,
                updatedAt: undefined,
                quellOrganisationId: quellOrganisation.id,
                zielOrganisationId: zielOrganisation.id,
                typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
            });

            const sourceResult: Option<Organisation<true, true>> = await sut.findByIdWithRelationships(
                quellOrganisation.id,
            );

            const targetResult: Option<Organisation<true, true>> = await sut.findByIdWithRelationships(
                zielOrganisation.id,
            );

            expect(sourceResult?.organisationsbeziehungen).toHaveLength(1);
            expect(targetResult?.organisationsbeziehungen).toEqual([]);
        });

        it('should return undefined if the organisation does not exist', async () => {
            const result: Option<Organisation<true, true>> = await sut.findByIdWithRelationships(faker.string.uuid());

            expect(result).toBeUndefined();
        });
    });
});
