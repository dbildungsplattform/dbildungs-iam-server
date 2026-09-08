/* eslint-disable no-await-in-loop */
import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DatabaseTestModule,
    DoFactory,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { createAndPersistPersonenkontext } from '../../../../test/utils/personenkontext-test-helper.js';
import { EventModule } from '../../../core/eventbus/event.module.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonEntity } from '../../person/persistence/person.entity.js';
import { mapAggregateToData } from '../../person/persistence/person.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleFactory } from '../../rolle/domain/rolle.factory.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { ServiceProviderModule } from '../../service-provider/service-provider.module.js';
import { PersonenkontextEntity } from './personenkontext.entity.js';
import { PersonenkontextScope } from './personenkontext.scope.js';

describe('PersonenkontextScope', () => {
    let module: TestingModule;
    let orm: MikroORM;
    let em: EntityManager;
    let rolleRepo: RolleRepo;
    let organisationRepo: OrganisationRepository;

    const createPersonEntity = (): PersonEntity => {
        const person: PersonEntity = em.create(PersonEntity, mapAggregateToData(DoFactory.createPerson(false)));
        return person;
    };

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                LoggingTestModule,
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                EventModule,
                LoggingTestModule,
                ServiceProviderModule,
            ],
            providers: [RolleFactory, RolleRepo, OrganisationRepository],
        }).compile();
        orm = module.get(MikroORM);
        em = module.get(EntityManager);
        rolleRepo = module.get(RolleRepo);
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
        describe('when filtering for personenkontexte', () => {
            beforeEach(async () => {
                const person: PersonEntity = createPersonEntity();
                await em.persist(person).flush();
                const organisation1: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                // const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
                // if (rolle instanceof DomainError) throw Error();
                // await createAndPersistPersonenkontext(em, person.id, organisation1.id, rolle.id);

                for (let i: number = 0; i < 30; i++) {
                    const rolle: Rolle<true> | DomainError = await rolleRepo.save(DoFactory.createRolle(false));
                    if (rolle instanceof DomainError) {
                        throw Error();
                    }
                    await createAndPersistPersonenkontext(em, person.id, rolle.id, organisation1.id);
                }
            });

            it('should return found personenkontexte', async () => {
                const scope: PersonenkontextScope = new PersonenkontextScope()
                    .findBy({ username: 'username' })
                    .sortBy('id', ScopeOrder.ASC)
                    .paged(10, 10);
                const [personenkontext, total]: Counted<PersonenkontextEntity> = await scope.executeQuery(em);

                expect(total).toBe(30);
                expect(personenkontext).toHaveLength(10);
            });
        });
    });

    describe('byOrganisations', () => {
        describe('when filtering for personenkontexte', () => {
            let orgaId: string;

            beforeEach(async () => {
                const person: PersonEntity = createPersonEntity();
                await em.persist(person).flush();
                const organisation1: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );
                orgaId = organisation1.id;

                const personenkontextPromises: Promise<PersonenkontextEntity>[] = [];
                for (let i: number = 0; i < 30; i++) {
                    personenkontextPromises.push(
                        rolleRepo.save(DoFactory.createRolle(false)).then((rolle: Rolle<true> | DomainError) => {
                            if (rolle instanceof DomainError) {
                                throw Error();
                            }
                            return createAndPersistPersonenkontext(em, person.id, rolle.id, organisation1.id);
                        }),
                    );
                }
                await Promise.all(personenkontextPromises);
            });

            it('should return found personenkontexte', async () => {
                const scope: PersonenkontextScope = new PersonenkontextScope()
                    .byOrganisations([orgaId])
                    .sortBy('id', ScopeOrder.ASC)
                    .paged(10, 10);
                const [personenkontext, total]: Counted<PersonenkontextEntity> = await scope.executeQuery(em);

                expect(total).toBe(30);
                expect(personenkontext).toHaveLength(10);
            });
        });
    });

    describe('findByRollen', () => {
        describe('when filtering for personenkontexte by rollenArt', () => {
            beforeEach(async () => {
                const rolleArten: RollenArt[] = [RollenArt.LEIT, RollenArt.LEHR, RollenArt.LERN];

                const organisation1: Organisation<true> = await organisationRepo.save(
                    DoFactory.createOrganisation(false),
                );

                for (const rolleArt of rolleArten) {
                    const person: PersonEntity = createPersonEntity();
                    await em.persist(person).flush();

                    const personenkontextPromises: Promise<PersonenkontextEntity>[] = [];
                    for (let i: number = 0; i < 10; i++) {
                        personenkontextPromises.push(
                            rolleRepo
                                .save(DoFactory.createRolle(false, { rollenart: rolleArt }))
                                .then((rolle: Rolle<true> | DomainError) => {
                                    if (rolle instanceof DomainError) {
                                        throw Error();
                                    }
                                    return createAndPersistPersonenkontext(em, person.id, rolle.id, organisation1.id);
                                }),
                        );
                    }
                    await Promise.all(personenkontextPromises);
                }
            });

            it('should return personenkontexte filtered by single rollenArt', async () => {
                const scope: PersonenkontextScope = new PersonenkontextScope().findByRollen([RollenArt.LEIT]);
                const [personenkontext, total]: Counted<PersonenkontextEntity> = await scope.executeQuery(em);

                expect(total).toBe(10);
                expect(personenkontext).toHaveLength(10);
                expect(
                    personenkontext.every(
                        (pk: PersonenkontextEntity) => pk.rolleId.getEntity().rollenart === RollenArt.LEIT,
                    ),
                ).toBe(true);
            });

            it('should return personenkontexte filtered by multiple rollenArt', async () => {
                const scope: PersonenkontextScope = new PersonenkontextScope().findByRollen([
                    RollenArt.LEHR,
                    RollenArt.LEIT,
                ]);
                const [personenkontext, total]: Counted<PersonenkontextEntity> = await scope.executeQuery(em);

                expect(total).toBe(20);
                expect(personenkontext).toHaveLength(20);
            });

            it('should return no personenkontexte for non-existent rollenArt', async () => {
                const scope: PersonenkontextScope = new PersonenkontextScope().findByRollen([RollenArt.EXTERN]);
                const [personenkontext, total]: Counted<PersonenkontextEntity> = await scope.executeQuery(em);

                expect(total).toBe(0);
                expect(personenkontext).toHaveLength(0);
            });
        });
    });
});
