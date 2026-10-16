import { vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { EventModule } from '../../../core/eventbus/event.module.js';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { MeldungRepo } from '../persistence/meldung.repo.js';
import { Meldung } from './meldung.js';
import { MeldungStatus } from '../persistence/meldung.entity.js';
import { type DomainError, MismatchedRevisionError } from '../../../shared/error/index.js';
import { MeldungInhaltError } from './meldung-inhalt.error.js';
import { faker } from '@faker-js/faker';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';

describe('Meldung Aggregate', () => {
    let module: TestingModule;
    let meldungRepoMock: DeepMocked<MeldungRepo>;

    beforeEach(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule, EventModule, ConfigTestModule],
            providers: [
                {
                    provide: MeldungRepo,
                    useValue: createMock(MeldungRepo),
                },
            ],
        }).compile();
        meldungRepoMock = module.get(MeldungRepo);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
        expect(meldungRepoMock).toBeDefined();
    });

    describe('createNew', () => {
        it('should not allow to create meldung with no characeters', () => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew('', MeldungStatus.VEROEFFENTLICHT);
            expect(result.ok).toBeFalsy();
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MeldungInhaltError);
            }
        });

        it('should not allow to create meldung with more then 2000 characeters', () => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew(
                faker.string.alphanumeric(2001),
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeFalsy();
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MeldungInhaltError);
            }
        });

        it('should be able to create meldung with valid length', () => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew(
                faker.string.alphanumeric(1000),
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeTruthy();
            if (result.ok) {
                expect(result.value).toBeInstanceOf(Meldung);
            }
        });
    });

    describe('update', () => {
        let meldung: Meldung<false>;

        beforeEach(() => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew(
                faker.string.alphanumeric(1000),
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeTruthy();
            if (result.ok) {
                meldung = result.value;
            }
        });

        it('should not allow to update meldung with wrong revision', () => {
            const result: Result<void, DomainError> = meldung.update(
                5,
                faker.string.alphanumeric(1500),
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeFalsy();
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MismatchedRevisionError);
            }
        });

        it('should not allow to update meldung with no characters', () => {
            const result: Result<void, DomainError> = meldung.update(1, '', MeldungStatus.VEROEFFENTLICHT);
            expect(result.ok).toBeFalsy();
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MeldungInhaltError);
            }
        });

        it('should not allow to update meldung with more than 2000 characters', () => {
            const result: Result<void, DomainError> = meldung.update(
                1,
                faker.string.alphanumeric(2001),
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeFalsy();
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(MeldungInhaltError);
            }
        });

        it('should be able to update meldung with valid length', () => {
            const result: Result<void, DomainError> = meldung.update(
                1,
                faker.string.alphanumeric(1500),
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeTruthy();
        });
    });

    describe('construct', () => {
        it('should construct meldung', () => {
            const result: Meldung<true> = Meldung.construct(
                faker.string.uuid(),
                faker.date.anytime(),
                faker.date.anytime(),
                faker.string.alphanumeric(200),
                MeldungStatus.NICHT_VEROEFFENTLICHT,
                3,
            );
            expect(result).toBeInstanceOf(Meldung);
        });
    });
});
