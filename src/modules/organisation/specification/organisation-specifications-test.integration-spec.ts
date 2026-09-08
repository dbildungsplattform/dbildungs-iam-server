import { MikroORM } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    DoFactory,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { EventModule } from '../../../core/eventbus/index.js';
import { DataConfig } from '../../../shared/config/data.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationEntity } from '../persistence/organisation.entity.js';
import { mapOrgaAggregateToData, OrganisationRepository } from '../persistence/organisation.repository.js';
import { KlasseNurVonSchuleAdministriert } from './klasse-nur-von-schule-administriert.js';
import { KlassenNameAnSchuleEindeutig } from './klassen-name-an-schule-eindeutig.js';
import { NurKlasseKursUnterSchule } from './nur-klasse-kurs-unter-schule.js';
import { OrganisationsOnSameSubtree } from './organisations-on-same-subtree.js';
import { SchuleUnterTraeger } from './schule-unter-traeger.js';
import { ZyklusInOrganisationen } from './zyklus-in-organisationen.js';

describe('OrganisationSpecificationTests', () => {
    let module: TestingModule;
    let repo: OrganisationRepository;
    let orm: MikroORM;

    let ROOT_ORGANISATION_ID: string;

    let root: Organisation<true>;
    let oeffentlich: Organisation<true>;
    let ersatz: Organisation<true>;

    let schule1: Organisation<true>;
    let schule2: Organisation<true>;
    let traeger1: Organisation<true>;
    let traeger2: Organisation<true>;
    let traeger3: Organisation<true>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                LoggingTestModule,
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                EventModule,
                LoggingTestModule,
            ],
            providers: [OrganisationRepository],
        }).compile();
        repo = module.get(OrganisationRepository);
        orm = module.get(MikroORM);

        await DatabaseTestModule.setupDatabase(orm);

        const config: ConfigService<ServerConfig> = module.get(ConfigService<ServerConfig>);
        ROOT_ORGANISATION_ID = config.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    }, 100000);

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);

        root = DoFactory.createOrganisation(true, {
            id: ROOT_ORGANISATION_ID,
            name: 'Root',
            typ: OrganisationsTyp.ROOT,
            administriertVon: undefined,
            zugehoerigZu: undefined,
        });

        await orm.em
            .persist(
                orm.em.create(
                    OrganisationEntity,
                    mapOrgaAggregateToData(
                        DoFactory.createOrganisation(false, {
                            id: repo.ROOT_ORGANISATION_ID,
                            name: 'Root',
                            typ: OrganisationsTyp.ROOT,
                            administriertVon: undefined,
                            zugehoerigZu: undefined,
                        }),
                    ),
                ),
            )
            .flush();

        oeffentlich = await repo.save(
            DoFactory.createOrganisation(false, {
                name: 'Öffentliche Schulen',
                typ: OrganisationsTyp.LAND,
                administriertVon: root.id,
                zugehoerigZu: root.id,
            }),
        );

        ersatz = await repo.save(
            DoFactory.createOrganisation(false, {
                name: 'Ersatz',
                typ: OrganisationsTyp.LAND,
                administriertVon: root.id,
                zugehoerigZu: root.id,
            }),
        );

        let traeger: Organisation<boolean> = DoFactory.createOrganisation(false, {
            name: 'Traeger1',
            typ: OrganisationsTyp.TRAEGER,
            administriertVon: oeffentlich.id,
            zugehoerigZu: oeffentlich.id,
        });
        traeger1 = await repo.save(traeger);
        traeger = DoFactory.createOrganisation(false, {
            name: 'Traeger2',
            typ: OrganisationsTyp.TRAEGER,
            administriertVon: traeger1.id,
            zugehoerigZu: traeger1.id,
        });
        traeger2 = await repo.save(traeger);
        traeger = DoFactory.createOrganisation(false, {
            name: 'Traeger3',
            typ: OrganisationsTyp.TRAEGER,
            administriertVon: traeger2.id,
            zugehoerigZu: traeger2.id,
        });
        traeger3 = await repo.save(traeger);
        let schule: Organisation<false> = DoFactory.createOrganisation(false, {
            name: 'Schule1',
            typ: OrganisationsTyp.SCHULE,
            administriertVon: oeffentlich.id,
            zugehoerigZu: traeger1.id,
        });
        schule1 = await repo.save(schule);
        schule = DoFactory.createOrganisation(false, {
            name: 'Schule2',
            typ: OrganisationsTyp.SCHULE,
            administriertVon: schule1.id,
            zugehoerigZu: schule1.id,
        });
        schule2 = await repo.save(schule);
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('schule-unter-traeger', () => {
        it('should be satisfied when typ is SCHULE and administriertVon is LAND and zugehoerigZu is TRAEGER ', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(repo);
            expect(await schuleUnterTraeger.isSatisfiedBy(schule1)).toBeTruthy();
        });
        it('should be satisfied when typ is SCHULE and zugehoerigZu is undefined/null', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(repo);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                administriertVon: traeger1.id,
                zugehoerigZu: undefined,
            });
            expect(await schuleUnterTraeger.isSatisfiedBy(schule)).toBeFalsy();
        });
        it('should be satisfied when typ is SCHULE and administriertVon is undefined/null', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(repo);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                administriertVon: undefined,
                zugehoerigZu: traeger1.id,
            });
            expect(await schuleUnterTraeger.isSatisfiedBy(schule)).toBeFalsy();
        });
        it('should not be satisfied when typ is SCHULE and administriertVon is SCHULE', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(repo);
            expect(await schuleUnterTraeger.isSatisfiedBy(schule2)).toBeFalsy();
        });
        it('should not be satisfied when typ is SCHULE and zugehoerigZu is SCHULE', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(repo);
            expect(await schuleUnterTraeger.isSatisfiedBy(schule2)).toBeFalsy();
        });
    });

    describe('Zyklus-in-organisationen', () => {
        it('should be satisfied, circular reference in two non-root organisations', async () => {
            traeger2.administriertVon = traeger3.id;
            const zyklusInOrganisationen: ZyklusInOrganisationen = new ZyklusInOrganisationen(repo);
            expect(await zyklusInOrganisationen.isSatisfiedBy(traeger2)).toBeTruthy();
        });

        it('should not be satisfied because chaining is not building a circular reference', async () => {
            const zyklusInOrganisationen: ZyklusInOrganisationen = new ZyklusInOrganisationen(repo);
            expect(await zyklusInOrganisationen.isSatisfiedBy(traeger3)).toBeFalsy();
        });

        //this case shall not happen, because in running app altering the root-organisation should be forbidden
        it('should be satisfied, circular reference between non-root and root organisation', async () => {
            let traeger: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Traeger1',
                typ: OrganisationsTyp.TRAEGER,
                administriertVon: undefined,
            });
            const t1: Organisation<true> = await repo.save(traeger);
            traeger = DoFactory.createOrganisation(false, {
                name: 'Traeger2',
                typ: OrganisationsTyp.TRAEGER,
                administriertVon: t1.id,
            });
            const t2: Organisation<true> = await repo.save(traeger);
            traeger = DoFactory.createOrganisation(false, {
                name: 'Traeger3',
                typ: OrganisationsTyp.TRAEGER,
                administriertVon: t2.id,
            });
            const t3: Organisation<true> = await repo.save(traeger);

            t1.administriertVon = t3.id;
            const zyklusInOrganisationen: ZyklusInOrganisationen = new ZyklusInOrganisationen(repo);
            expect(await zyklusInOrganisationen.isSatisfiedBy(t1)).toBeTruthy();
        });
    });

    describe('nur-klasse-kurs-unter-schule', () => {
        it('should be satisfied when typ is undefined and parent has typ SCHULE', async () => {
            const klasseDo: Organisation<false> = DoFactory.createOrganisation(false, {
                name: 'Klasse1',
                typ: undefined,
                administriertVon: schule1.id,
                zugehoerigZu: schule1.id,
            });
            const klasse: Organisation<true> = await repo.save(klasseDo);
            const nurKlasseKursUnterSchule: NurKlasseKursUnterSchule = new NurKlasseKursUnterSchule(repo);
            expect(await nurKlasseKursUnterSchule.isSatisfiedBy(klasse)).toBeTruthy();
        });
        it('should not be satisfied when typ is TRAEGER and parent via administriertVon has typ SCHULE', async () => {
            const traegerDo: Organisation<false> = DoFactory.createOrganisation(false, {
                name: 'EinTraeger',
                typ: OrganisationsTyp.TRAEGER,
                administriertVon: schule1.id,
                zugehoerigZu: undefined,
            });
            const einTraeger: Organisation<true> = await repo.save(traegerDo);
            const nurKlasseKursUnterSchule: NurKlasseKursUnterSchule = new NurKlasseKursUnterSchule(repo);
            expect(await nurKlasseKursUnterSchule.isSatisfiedBy(einTraeger)).toBeFalsy();
        });
        it('should not be satisfied when typ is TRAEGER and parent via zugehoerigZu has typ SCHULE', async () => {
            const traegerDo: Organisation<false> = DoFactory.createOrganisation(false, {
                name: 'EinTraeger',
                typ: OrganisationsTyp.TRAEGER,
                administriertVon: undefined,
                zugehoerigZu: schule1.id,
            });
            const einTraeger: Organisation<true> = await repo.save(traegerDo);
            const nurKlasseKursUnterSchule: NurKlasseKursUnterSchule = new NurKlasseKursUnterSchule(repo);
            expect(await nurKlasseKursUnterSchule.isSatisfiedBy(einTraeger)).toBeFalsy();
        });
        it('should be satisfied when typ not Klasse/Kurs and administriertVon is undefined/null', async () => {
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
                administriertVon: undefined,
                zugehoerigZu: undefined,
            });
            const nurKlasseKursUnterSchule: NurKlasseKursUnterSchule = new NurKlasseKursUnterSchule(repo);
            expect(await nurKlasseKursUnterSchule.isSatisfiedBy(traeger)).toBeTruthy();
        });
        it('should be satisfied when zugehoerigZu is undefined/null', async () => {
            const sonstige: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SONSTIGE,
                administriertVon: undefined,
                zugehoerigZu: undefined,
            });
            const nurKlasseKursUnterSchule: NurKlasseKursUnterSchule = new NurKlasseKursUnterSchule(repo);
            expect(await nurKlasseKursUnterSchule.isSatisfiedBy(sonstige)).toBeTruthy();
        });
    });

    describe('klasse-nur-von-schule-administriert', () => {
        it('should be satisfied when typ is not KLASSE', async () => {
            const keineKlasseDo: Organisation<false> = DoFactory.createOrganisation(false, {
                name: 'KeineKlasse',
                typ: undefined,
                administriertVon: traeger1.id,
                zugehoerigZu: traeger1.id,
            });
            const keineKlasse: Organisation<true> = await repo.save(keineKlasseDo);
            const klasseNurVonSchuleAdministriert: KlasseNurVonSchuleAdministriert =
                new KlasseNurVonSchuleAdministriert(repo);
            expect(await klasseNurVonSchuleAdministriert.isSatisfiedBy(keineKlasse)).toBeTruthy();
        });
        it('should NOT be satisfied when typ is KLASSE and administriertVon is undefined/null', async () => {
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                administriertVon: undefined,
                zugehoerigZu: schule1.id,
            });
            const klasseNurVonSchuleAdministriert: KlasseNurVonSchuleAdministriert =
                new KlasseNurVonSchuleAdministriert(repo);
            expect(await klasseNurVonSchuleAdministriert.isSatisfiedBy(klasse)).toBeFalsy();
        });
        it('should NOT be satisfied when typ is KLASSE and zugehoerigZu is undefined/null', async () => {
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                administriertVon: schule1.id,
                zugehoerigZu: undefined,
            });
            const klasseNurVonSchuleAdministriert: KlasseNurVonSchuleAdministriert =
                new KlasseNurVonSchuleAdministriert(repo);
            expect(await klasseNurVonSchuleAdministriert.isSatisfiedBy(klasse)).toBeFalsy();
        });
    });

    describe('klassen-name-an-schule-eindeutig', () => {
        it('should be satisfied when typ is not KLASSE', async () => {
            const keineKlasseDo: Organisation<false> = DoFactory.createOrganisation(false, {
                name: 'KeineKlasse',
                typ: undefined,
                administriertVon: traeger1.id,
                zugehoerigZu: traeger1.id,
            });
            const keineKlasse: Organisation<true> = await repo.save(keineKlasseDo);
            const klassenNameAnSchuleEindeutig: KlassenNameAnSchuleEindeutig = new KlassenNameAnSchuleEindeutig(repo);
            expect(await klassenNameAnSchuleEindeutig.isSatisfiedBy(keineKlasse)).toBeTruthy();
        });
        it('should NOT be satisfied when typ is KLASSE and administriertVon is undefined/null', async () => {
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                administriertVon: undefined,
                zugehoerigZu: schule1.id,
            });
            const klassenNameAnSchuleEindeutig: KlassenNameAnSchuleEindeutig = new KlassenNameAnSchuleEindeutig(repo);
            expect(await klassenNameAnSchuleEindeutig.isSatisfiedBy(klasse)).toBeFalsy();
        });
    });

    describe('organisations-on-same-subtree', () => {
        it('should be satisfied when organisations have same land parent', async () => {
            const organisationsOnSameSubtree: OrganisationsOnSameSubtree = new OrganisationsOnSameSubtree(repo);
            expect(await organisationsOnSameSubtree.isSatisfiedBy([traeger1, schule1])).toBeTruthy();
        });

        it("should NOT be satisfied when organisations don't have same land parent", async () => {
            const ersatzschule: Organisation<true> = await repo.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: ersatz.id,
                    zugehoerigZu: ersatz.id,
                }),
            );
            const organisationsOnSameSubtree: OrganisationsOnSameSubtree = new OrganisationsOnSameSubtree(repo);
            expect(await organisationsOnSameSubtree.isSatisfiedBy([traeger1, ersatzschule])).toBeFalsy();
        });
    });
});
