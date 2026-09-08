import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '../../../../../test/utils/createMock.js';
import {
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    EmailConfigTestModule,
} from '../../../../../test/utils/index.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { DomainError } from '../../../../shared/error/domain.error.js';
import { EmailDomain } from '../domain/email-domain.js';
import { EmailCoreModule } from '../email-core.module.js';
import { EmailAddressRepo } from './email-address.repo.js';
import { EmailDomainRepo } from './email-domain.repo.js';

describe('EmailDomainRepo', () => {
    let module: TestingModule;
    let sut: EmailDomainRepo;
    let orm: MikroORM;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), EmailCoreModule],
            providers: [EmailAddressRepo, ClassLogger],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();

        sut = module.get(EmailDomainRepo);
        orm = module.get(MikroORM);

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
    });

    async function createAndSaveDomain(domain?: string, spshServiceProviderId?: string): Promise<EmailDomain<true>> {
        const mailToCreate: EmailDomain<false> = EmailDomain.createNew({
            domain: domain ?? faker.internet.email(),
            spshServiceProviderId: spshServiceProviderId ?? faker.string.uuid(),
        });
        const tmp: EmailDomain<true> | DomainError = await sut.save(mailToCreate);
        if (tmp instanceof DomainError) {
            throw tmp;
        }
        return tmp;
    }

    describe('existsEmailDomain', () => {
        let createdDomain: EmailDomain<true>;

        beforeEach(async () => {
            createdDomain = await createAndSaveDomain();
        });

        it('should return true if email domain exists', async () => {
            const result: Option<EmailDomain<true>> = await sut.findBySpshServiceProviderId(
                createdDomain.spshServiceProviderId,
            );
            expect(result).toBeDefined();
            expect(result).not.toBeNull();
            expect(result).toBeInstanceOf(EmailDomain);
            expect((result as EmailDomain<true>).id).toBe(createdDomain.id);
            expect((result as EmailDomain<true>).domain).toBe(createdDomain.domain);
        });

        it('should return false if email domain does not exist', async () => {
            const result: Option<EmailDomain<true>> = await sut.findBySpshServiceProviderId(faker.string.uuid());
            expect(result).toBeNull();
        });
    });

    describe('.save', () => {
        it('should create a new email domain', async () => {
            const domainName: string = faker.internet.domainName();
            const spshServiceProviderId: string = faker.string.uuid();
            const mailToCreate: EmailDomain<false> = EmailDomain.createNew({
                domain: domainName,
                spshServiceProviderId: spshServiceProviderId,
            });
            const result: EmailDomain<true> | DomainError = await sut.save(mailToCreate);

            expect(result).toBeDefined();
            expect(result).not.toBeInstanceOf(DomainError);
            expect((result as EmailDomain<true>).domain).toBe(domainName);

            const persisted: Option<EmailDomain<true>> = await sut.findBySpshServiceProviderId(
                (result as EmailDomain<true>).spshServiceProviderId,
            );
            expect(persisted).toBeDefined();
            expect((persisted as EmailDomain<true>).domain).toBe(domainName);
        });

        it('should update an existing email domain', async () => {
            const originalDomain: string = faker.internet.domainName();
            const spshServiceProviderId: string = faker.string.uuid();
            const created: EmailDomain<true> = await createAndSaveDomain(originalDomain, spshServiceProviderId);

            const updatedDomainValue: string = faker.internet.domainName();
            const updatedDomain: EmailDomain<boolean> = new EmailDomain(
                created.id,
                created.createdAt,
                created.updatedAt,
                updatedDomainValue,
                created.spshServiceProviderId,
            );

            const result: EmailDomain<true> | DomainError = await sut.save(updatedDomain);

            expect(result).toBeDefined();
            expect(result).not.toBeInstanceOf(DomainError);
            expect((result as EmailDomain<true>).domain).toBe(updatedDomainValue);

            const persisted: Option<EmailDomain<true>> = await sut.findBySpshServiceProviderId(
                created.spshServiceProviderId,
            );
            expect(persisted).toBeDefined();
            expect((persisted as EmailDomain<true>).domain).toBe(updatedDomainValue);
        });

        it('should return DomainError when updating a non-existent email domain', async () => {
            const nonExistentId: string = faker.string.uuid();
            const updatedDomainValue: string = faker.internet.domainName();
            const spshServiceProviderId: string = faker.string.uuid();
            const updatedDomain: EmailDomain<boolean> = new EmailDomain(
                nonExistentId,
                new Date(),
                new Date(),
                updatedDomainValue,
                spshServiceProviderId,
            );

            const result: EmailDomain<true> | DomainError = await sut.save(updatedDomain);

            expect(result).toBeInstanceOf(DomainError);
        });
    });
});
