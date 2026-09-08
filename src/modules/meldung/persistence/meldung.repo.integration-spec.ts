import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS } from '../../../../test/utils/timeouts.js';
import { Meldung } from '../domain/meldung.js';
import { MeldungStatus } from './meldung.entity.js';
import { MeldungRepo } from './meldung.repo.js';

describe('MeldungRepo', () => {
    let module: TestingModule;
    let sut: MeldungRepo;

    let orm: MikroORM;
    let em: EntityManager;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), LoggingTestModule],
            providers: [MeldungRepo],
        }).compile();

        sut = module.get(MeldungRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
        expect(em).toBeDefined();
    });

    describe('getRecentVeroeffentlichtMeldung', () => {
        it('should return the most recent veroffentlicht meldung meldung', async () => {
            const meldung1: Meldung<false> = DoFactory.createMeldung(false);
            const meldung2: Meldung<false> = DoFactory.createMeldung(false);
            meldung1.updatedAt = new Date(2010, 12, 12);
            meldung1.status = MeldungStatus.VEROEFFENTLICHT;
            meldung2.updatedAt = new Date(2020, 12, 12);
            meldung2.status = MeldungStatus.VEROEFFENTLICHT;

            await sut.save(meldung1);
            const savedMeldung2: Meldung<true> = await sut.save(meldung1);

            em.clear();

            const meldungResult: Option<Meldung<true>> = await sut.getRecentVeroeffentlichtMeldung();

            expect(meldungResult).toBeDefined();
            expect(meldungResult).toBeInstanceOf(Meldung);
            expect(meldungResult?.id).toEqual(savedMeldung2.id);
        });

        it('should return null if only nicht veroffentlicht exists', async () => {
            const meldung1: Meldung<false> = DoFactory.createMeldung(false);
            meldung1.status = MeldungStatus.NICHT_VEROEFFENTLICHT;

            await sut.save(meldung1);
            const meldung: Option<Meldung<true>> = await sut.getRecentVeroeffentlichtMeldung();
            expect(meldung).toBeNull();
        });

        it('should return null if nothing exists', async () => {
            const meldung: Option<Meldung<true>> = await sut.getRecentVeroeffentlichtMeldung();
            expect(meldung).toBeNull();
        });
    });

    describe('findById', () => {
        it('should return the meldung', async () => {
            const meldung: Meldung<true> = await sut.save(DoFactory.createMeldung(false));
            em.clear();

            const meldungResult: Option<Meldung<true>> = await sut.findById(meldung.id);

            expect(meldungResult).toBeDefined();
            expect(meldungResult).toBeInstanceOf(Meldung);
        });

        it('should return null if the entity does not exist', async () => {
            const meldung: Option<Meldung<true>> = await sut.findById(faker.string.uuid());

            expect(meldung).toBeNull();
        });
    });

    describe('findAll', () => {
        it('should return all meldungen', async () => {
            await sut.save(DoFactory.createMeldung(false));
            await sut.save(DoFactory.createMeldung(false));
            em.clear();

            const meldungenResult: Meldung<true>[] = await sut.findAll();

            expect(meldungenResult).toBeDefined();
            expect(meldungenResult.length).toEqual(2);
        });
    });

    describe('save', () => {
        it('should create the meldung if has not been persisted', async () => {
            await sut.save(DoFactory.createMeldung(false));
            em.clear();

            const meldungenResultAfter: Meldung<true>[] = await sut.findAll();
            expect(meldungenResultAfter).toBeDefined();
            expect(meldungenResultAfter.length).toEqual(1);
        });

        it('should update the meldung if has been persisted', async () => {
            const meldung: Meldung<true> = await sut.save(DoFactory.createMeldung(false));
            em.clear();

            meldung.inhalt = 'Mein Demo Inhalt 123';
            await sut.save(meldung);
            em.clear();

            const meldungenResultAfterUpdate: Meldung<true>[] = await sut.findAll();
            expect(meldungenResultAfterUpdate).toBeDefined();
            expect(meldungenResultAfterUpdate.length).toEqual(1);
            expect(meldungenResultAfterUpdate.at(0)?.inhalt).toEqual('Mein Demo Inhalt 123');
        });
    });
});
