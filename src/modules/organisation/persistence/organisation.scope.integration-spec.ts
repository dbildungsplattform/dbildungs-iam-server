import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DatabaseTestModule,
    DoFactory,
    EventSystemTestModule,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationEntity } from './organisation.entity.js';
import { OrganisationRepository } from './organisation.repository.js';
import { OrganisationScope } from './organisation.scope.js';

describe('OrganisationScope', () => {
    let module: TestingModule;
    let orm: MikroORM;
    let em: EntityManager;

    let organisationRepo: OrganisationRepository;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                LoggingTestModule,
                EventSystemTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
            ],
            providers: [OrganisationRepository],
        }).compile();
        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        organisationRepo = module.get(OrganisationRepository);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    describe('findBy', () => {
        describe('when filtering for organizations', () => {
            beforeEach(async () => {
                const organisations: Promise<Organisation<true>>[] = Array.from(
                    { length: 100 },
                    (_v: unknown, i: number) =>
                        organisationRepo.save(DoFactory.createOrganisation(false, { name: `Organization #${i}` })),
                );

                await Promise.all(organisations);
            });

            it('should return found organizations', async () => {
                const scope: OrganisationScope = new OrganisationScope()
                    .findBy({ name: new RegExp('Organization #1') })
                    .sortBy('name', ScopeOrder.ASC)
                    .paged(5, 10);

                const [organisations, total]: Counted<OrganisationEntity> = await scope.executeQuery(em);

                expect(total).toBe(11);
                expect(organisations).toHaveLength(6);
            });
        });
    });

    describe('excludeTyp', () => {
        describe('when excluding organisation types', () => {
            beforeEach(async () => {
                const organisations: Promise<Organisation<true>>[] = [
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.ROOT }),
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.LAND }),
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.TRAEGER }),
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SCHULE }),
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.KLASSE }),
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.ANBIETER }),
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.SONSTIGE }),
                    DoFactory.createOrganisation(false, { typ: OrganisationsTyp.UNBEST }),
                ].map((o: Organisation<false>) => organisationRepo.save(o));

                await Promise.all(organisations);
            });

            it('should return found organizations', async () => {
                const scope: OrganisationScope = new OrganisationScope()
                    .excludeTyp([OrganisationsTyp.SCHULE, OrganisationsTyp.TRAEGER])
                    .sortBy('name', ScopeOrder.ASC);

                const [organisations]: Counted<OrganisationEntity> = await scope.executeQuery(em);

                expect(organisations).toHaveLength(6);
            });
        });
    });

    describe('findBySearchString', () => {
        describe('when filtering for organizations by name', () => {
            beforeEach(async () => {
                const organisations: Promise<Organisation<true>>[] = [
                    DoFactory.createOrganisation(false, { name: '9a' }),
                    DoFactory.createOrganisation(false, { name: '9' }),
                    DoFactory.createOrganisation(false, { name: '9b' }),
                ].map((o: Organisation<false>) => organisationRepo.save(o));

                await Promise.all(organisations);
            });

            it('should return found organizationen', async () => {
                const scope: OrganisationScope = new OrganisationScope()
                    .searchStringAdministriertVon('9')
                    .sortBy('name', ScopeOrder.ASC)
                    .paged(1, 10);

                const [organisations]: Counted<OrganisationEntity> = await scope.executeQuery(em);

                expect(organisations).toHaveLength(2);
            });
        });
    });

    describe('filterByIds', () => {
        describe('when filtering organizations by specific IDs', () => {
            let organisations: Organisation<true>[] = [];

            beforeEach(async () => {
                // Create and persist 10 organizations with different names
                const organisationPromises: Promise<Organisation<true>>[] = Array.from(
                    { length: 100 },
                    (_v: unknown, i: number) =>
                        organisationRepo.save(
                            DoFactory.createOrganisation(false, {
                                name: `Organization #${i}`,
                                typ: OrganisationsTyp.SCHULE,
                            }),
                        ),
                );

                organisations = await Promise.all(organisationPromises);
            });

            it('should return only the organizations with the specified IDs', async () => {
                // Define a set of IDs to filter by
                if (organisations && organisations.length > 0) {
                    const orgaIdsToFilter: string[] = [
                        organisations[1]?.id,
                        organisations[3]?.id,
                        organisations[5]?.id,
                    ].filter((id: string | undefined): id is string => !!id);

                    const scope: OrganisationScope = new OrganisationScope()
                        .filterByIds(orgaIdsToFilter)
                        .sortBy('name', ScopeOrder.ASC);

                    const [foundOrganisations]: Counted<OrganisationEntity> = await scope.executeQuery(em);

                    // Check that the correct organizations are returned
                    expect(foundOrganisations).toHaveLength(3);

                    // Ensure that the organizations match the filtered IDs
                    const foundIds: string[] = foundOrganisations.map((org: OrganisationEntity) => org.id);
                    expect(foundIds).toEqual(expect.arrayContaining(orgaIdsToFilter));
                }
            });
        });
    });
});
