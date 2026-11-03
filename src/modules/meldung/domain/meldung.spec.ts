import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { LoggingTestModule } from '../../../../test/utils/logging-test.module.js';
import { EventModule } from '../../../core/eventbus/event.module.js';
import { type DomainError, MismatchedRevisionError } from '../../../shared/error/index.js';
import { MeldungStatus } from '../persistence/meldung.entity.js';
import { MeldungRepo } from '../persistence/meldung.repo.js';
import { MeldungInhaltError } from './meldung-inhalt.error.js';
import { Meldung } from './meldung.js';

describe('Meldung Aggregate', () => {
    let module: TestingModule;
    let meldungRepoMock: DeepMocked<MeldungRepo>;

    type SanitizationCase = { description: string; inhalt: string; expected: string };

    const sanitizationCases: SanitizationCase[] = [
        {
            description: 'remove script elements and their contents',
            inhalt: '<p>Notice</p><script>alert("unsafe")</script>',
            expected: '<p>Notice</p>',
        },
        {
            description: 'remove event-handler attributes',
            inhalt: '<p onclick="alert(1)">Notice<img src="image.png" onerror="alert(2)"></p>',
            expected: '<p>Notice<img src="image.png"></p>',
        },
        {
            description: 'remove unsafe link URLs',
            inhalt: '<a href="javascript:alert(1)">Notice</a>',
            expected: '<a target="_blank" rel="noopener noreferrer nofollow">Notice</a>',
        },
        {
            description: 'preserve safe formatting',
            inhalt: '<p><strong>Important</strong> <em>notice</em><br></p><ul><li>Details</li></ul>',
            expected: '<p><strong>Important</strong> <em>notice</em><br></p><ul><li>Details</li></ul>',
        },
        {
            description: 'add secure target and rel attributes to safe links',
            inhalt: '<a href="https://example.com">Notice</a>',
            expected: '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">Notice</a>',
        },
        {
            description: 'override supplied target and rel attributes on safe links',
            inhalt: '<a href="https://example.com" target="_self" rel="opener">Notice</a>',
            expected: '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">Notice</a>',
        },
    ];

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
        it.each(sanitizationCases)('should $description', ({ inhalt, expected }: SanitizationCase) => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew(
                inhalt,
                MeldungStatus.VEROEFFENTLICHT,
            );

            expect(result.ok).toBeTruthy();
            if (!result.ok) {
                throw result.error;
            }
            expect(result.value.inhalt).toBe(expected);
        });

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

        it.each(sanitizationCases)('should $description', ({ inhalt, expected }: SanitizationCase) => {
            const result: Result<void, DomainError> = meldung.update(1, inhalt, MeldungStatus.VEROEFFENTLICHT);

            expect(result.ok).toBeTruthy();
            expect(meldung.inhalt).toBe(expected);
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

    describe('sanitizeInhalt', () => {
        it('should force target _blank and secure rel on anchor elements', () => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew(
                '<a href="https://example.com" target="_self" rel="opener">link</a>',
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeTruthy();
            if (result.ok) {
                expect(result.value.inhalt).toContain('target="_blank"');
                expect(result.value.inhalt).toContain('rel="noopener noreferrer nofollow"');
                expect(result.value.inhalt).not.toContain('_self');
                expect(result.value.inhalt).not.toContain('opener"');
                expect(result.value.inhalt).not.toContain('xlink:show');
            }
        });

        it('should set xlink:show to new on href elements without target property', () => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew(
                '<p>text <svg><image xlink:href="https://example.com/image.png"/></svg></p>',
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeTruthy();
            if (result.ok) {
                expect(result.value.inhalt).toContain('xlink:show="new"');
            }
        });

        it('should not set xlink:show on elements without href', () => {
            const result: Result<Meldung<false>, DomainError> = Meldung.createNew(
                '<p>text</p>',
                MeldungStatus.VEROEFFENTLICHT,
            );
            expect(result.ok).toBeTruthy();
            if (result.ok) {
                expect(result.value.inhalt).not.toContain('xlink:show');
            }
        });
    });

    describe('construct', () => {
        it.each(sanitizationCases)('should $description', ({ inhalt, expected }: SanitizationCase) => {
            const meldung: Meldung<true> = Meldung.construct(
                'meldung-id',
                new Date('2026-01-01T00:00:00.000Z'),
                new Date('2026-01-01T00:00:00.000Z'),
                inhalt,
                MeldungStatus.NICHT_VEROEFFENTLICHT,
                3,
            );

            expect(meldung.inhalt).toBe(expected);
        });

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
