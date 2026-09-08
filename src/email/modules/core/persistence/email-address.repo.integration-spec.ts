import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '../../../../../test/utils/createMock.js';
import {
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
    EmailConfigTestModule,
    expectErrResult,
    expectOkResult,
} from '../../../../../test/utils/index.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { EntityNotFoundError } from '../../../../shared/error/entity-not-found.error.js';
import { EmailAddress } from '../domain/email-address.js';
import { EmailCoreModule } from '../email-core.module.js';
import { EmailAddressNotFoundError } from '../error/email-address-not-found.error.js';
import { EmailAddressStatusEnum } from './email-address-status.entity.js';
import { EmailAddressRepo } from './email-address.repo.js';

describe('EmailRepo', () => {
    let module: TestingModule;
    let sut: EmailAddressRepo;
    let orm: MikroORM;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), EmailCoreModule],
            providers: [EmailAddressRepo, ClassLogger],
        })
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();

        sut = module.get(EmailAddressRepo);
        orm = module.get(MikroORM);

        await DatabaseTestModule.setupDatabase(orm);
        vi.useFakeTimers();
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

    async function createAndSaveMail(
        address?: string,
        priority?: number,
        spshPersonId?: string,
        oxUserCounter?: string,
        markedForCron?: Date,
    ): Promise<EmailAddress<true>> {
        const mailToCreate: EmailAddress<false> = EmailAddress.createNew({
            address: address ?? faker.internet.email(),
            priority: priority ?? 1,
            spshPersonId: spshPersonId ?? faker.string.uuid(),
            oxUserCounter: oxUserCounter ?? undefined,
            markedForCron: markedForCron ?? undefined,
            externalId: faker.string.uuid(),
        });

        const saveResult: Result<EmailAddress<true>> = await sut.save(mailToCreate);

        expectOkResult(saveResult);
        return saveResult.value;
    }

    async function setStatus(mail: EmailAddress<true>, status: EmailAddressStatusEnum): Promise<EmailAddress<true>> {
        // sometimes we end up with two status with the same timestamp which causes non-deterministic sorting, so we wait a bit to ensure different timestamps
        // this issue is only relevant for this test and not a real issue in production since the statuses are not set in such quick succession
        await vi.advanceTimersByTimeAsync(10);

        mail.setStatus(status);
        const saveResult: Result<EmailAddress<true>> = await sut.save(mail);
        expectOkResult(saveResult);
        return saveResult.value;
    }

    describe('findEmailAddress', () => {
        let createdMail: EmailAddress<true>;

        beforeEach(async () => {
            createdMail = await createAndSaveMail();
        });

        it('should return EmailAddress if address exists', async () => {
            const result: Option<EmailAddress<true>> = await sut.findEmailAddress(createdMail.address);
            expect(result).toBeDefined();
            expect(result!.address).toBe(createdMail.address);
            expect(result!.id).toBe(createdMail.id);
        });

        it('should return EmailAddress with sorted statuses', async () => {
            async function setStatusAndSave(status: EmailAddressStatusEnum): Promise<void> {
                await vi.advanceTimersByTimeAsync(10);
                createdMail.setStatus(status);
                const saveResult: Result<EmailAddress<true>> = await sut.save(createdMail);

                expectOkResult(saveResult);
                createdMail = saveResult.value;
            }

            await setStatusAndSave(EmailAddressStatusEnum.PENDING);
            await setStatusAndSave(EmailAddressStatusEnum.ACTIVE);
            await setStatusAndSave(EmailAddressStatusEnum.FAILED);
            await setStatusAndSave(EmailAddressStatusEnum.SUSPENDED);

            const result: Option<EmailAddress<true>> = await sut.findEmailAddress(createdMail.address);

            expect(result).toBeDefined();
            expect(result!.sortedStatuses).toEqual([
                expect.objectContaining({ status: EmailAddressStatusEnum.SUSPENDED }),
                expect.objectContaining({ status: EmailAddressStatusEnum.FAILED }),
                expect.objectContaining({ status: EmailAddressStatusEnum.ACTIVE }),
                expect.objectContaining({ status: EmailAddressStatusEnum.PENDING }),
            ]);
        });

        it('should return undefined if address does not exist', async () => {
            const result: Option<EmailAddress<true>> = await sut.findEmailAddress(faker.internet.email());
            expect(result).toBeUndefined();
        });
    });

    describe('existsEmailAddress', () => {
        let createdMail: EmailAddress<true>;

        beforeEach(async () => {
            createdMail = await createAndSaveMail();
        });

        it('should return true if email address exists', async () => {
            const result: boolean = await sut.existsEmailAddress(createdMail.address);
            expect(result).toBe(true);
        });

        it('should return false if email address does not exist', async () => {
            const result: boolean = await sut.existsEmailAddress(faker.internet.email());
            expect(result).toBe(false);
        });
    });

    describe('findBySpshPersonIdSortedByPriorityAsc', () => {
        const spshPersonId: string = faker.string.uuid();
        const otherSpshPersonId: string = faker.string.uuid();

        beforeEach(async () => {
            await createAndSaveMail(undefined, 2, spshPersonId);
            await createAndSaveMail(undefined, 0, spshPersonId);
            await createAndSaveMail(undefined, 1, spshPersonId);
            await createAndSaveMail(undefined, 1, otherSpshPersonId);
        });

        it('should return all email addresses for the given spshPersonId', async () => {
            const result: EmailAddress<true>[] = await sut.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);
            expect(result).toHaveLength(3);
            const allSpshPersonIds: (string | undefined)[] = result.map((e: EmailAddress<true>) => e.spshPersonId);
            expect(allSpshPersonIds.every((id: string | undefined) => id === spshPersonId)).toBe(true);
        });

        it('should return email addresses sorted by priority ascending', async () => {
            const result: EmailAddress<true>[] = await sut.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);
            const priorities: number[] = result.map((e: EmailAddress<true>) => e.priority);
            expect(priorities).toEqual([0, 1, 2]);
        });

        it('should return an empty array if no email addresses exist for the given spshPersonId', async () => {
            const unknownId: string = faker.string.uuid();
            const result: EmailAddress<true>[] = await sut.findBySpshPersonIdSortedByPriorityAsc(unknownId);
            expect(result).toEqual([]);
        });
    });

    describe('findPrimaryBySpshPersonIds', () => {
        const spshPersonIds: string[] = [faker.string.uuid(), faker.string.uuid(), faker.string.uuid()];
        let mail1: EmailAddress<true>;
        let mail2: EmailAddress<true>;
        let mail3: EmailAddress<true>;
        let mail4: EmailAddress<true>;
        let mail5: EmailAddress<true>;

        beforeEach(async () => {
            mail1 = await createAndSaveMail(undefined, 1, spshPersonIds[0]);
            await setStatus(mail1, EmailAddressStatusEnum.SUSPENDED);
            mail2 = await createAndSaveMail(undefined, 0, spshPersonIds[0]);
            await setStatus(mail2, EmailAddressStatusEnum.ACTIVE);
            mail3 = await createAndSaveMail(undefined, 1, spshPersonIds[1]);
            await setStatus(mail3, EmailAddressStatusEnum.SUSPENDED);
            mail4 = await createAndSaveMail(undefined, 2, spshPersonIds[1]);
            await setStatus(mail4, EmailAddressStatusEnum.SUSPENDED);
            mail5 = await createAndSaveMail(undefined, 0, spshPersonIds[2]);
            await setStatus(mail5, EmailAddressStatusEnum.ACTIVE);
            await setStatus(mail5, EmailAddressStatusEnum.SUSPENDED);
        });

        it('should return primary email addresses for the given spshPersonIds', async () => {
            const result: EmailAddress<true>[] = await sut.findPrimaryBySpshPersonIds(spshPersonIds);
            expect(result).toHaveLength(1);
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ id: mail2.id })]));
        });

        it('should return null for unknown spshPersonIds', async () => {
            const unknownIds: string[] = [faker.string.uuid(), faker.string.uuid()];
            const result: EmailAddress<true>[] = await sut.findPrimaryBySpshPersonIds(unknownIds);
            expect(result).toHaveLength(0);
        });

        it('should return only primary email addresses with status aktive even if multiple exist for a spshPersonId', async () => {
            const pid: string = faker.string.uuid();

            const mail1: EmailAddress<true> = await createAndSaveMail(undefined, 0, pid);
            await setStatus(mail1, EmailAddressStatusEnum.ACTIVE);

            const mail2: EmailAddress<true> = await createAndSaveMail(undefined, 1, pid);
            await setStatus(mail2, EmailAddressStatusEnum.SUSPENDED);

            const mail3: EmailAddress<true> = await createAndSaveMail(undefined, 0, pid);
            await setStatus(mail3, EmailAddressStatusEnum.ACTIVE);
            await setStatus(mail3, EmailAddressStatusEnum.SUSPENDED);

            const result: EmailAddress<true>[] = await sut.findPrimaryBySpshPersonIds([pid]);

            expect(result).toHaveLength(1);
            expect(result[0]!.spshPersonId).toBe(pid);
            expect(result[0]!.priority).toBe(0);
        });
    });

    describe('findAllEmailAddressesWithStatusesDescBySpshPersonId', () => {
        const spshPersonId: string = faker.string.uuid();

        it('should return email addresses with their statuses for a given spshPersonId', async () => {
            let mail1: EmailAddress<true> = await createAndSaveMail(undefined, 1, spshPersonId);
            let mail2: EmailAddress<true> = await createAndSaveMail(undefined, 2, spshPersonId);

            mail1 = await setStatus(mail1, EmailAddressStatusEnum.PENDING);
            mail1 = await setStatus(mail1, EmailAddressStatusEnum.ACTIVE);
            mail2 = await setStatus(mail2, EmailAddressStatusEnum.PENDING);

            const result: EmailAddress<true>[] = await sut.findBySpshPersonIdSortedByPriorityAsc(spshPersonId);

            expect(result).toHaveLength(2);
            const addresses: string[] = result.map((mail: EmailAddress<true>) => mail.address);
            expect(addresses).toContain(mail1.address);
            expect(addresses).toContain(mail2.address);

            const mail1Dto: EmailAddress<true> | undefined = result.find(
                (mail: EmailAddress<true>) => mail.id === mail1.id,
            );
            expect(mail1Dto).toBeDefined();
            expect(mail1Dto!.sortedStatuses).toHaveLength(2);
            expect(mail1Dto!.sortedStatuses[0]?.status).toBe(EmailAddressStatusEnum.ACTIVE);
            expect(mail1Dto!.sortedStatuses[1]?.status).toBe(EmailAddressStatusEnum.PENDING);

            const mail2Dto: EmailAddress<true> | undefined = result.find(
                (mail: EmailAddress<true>) => mail.id === mail2.id,
            );
            expect(mail2Dto).toBeDefined();
            expect(mail2Dto!.sortedStatuses).toHaveLength(1);
            expect(mail2Dto!.sortedStatuses[0]?.status).toBe(EmailAddressStatusEnum.PENDING);
        });

        it('should return an empty array if no email addresses exist for the given spshPersonId', async () => {
            const unknownId: string = faker.string.uuid();
            const result: EmailAddress<true>[] = await sut.findBySpshPersonIdSortedByPriorityAsc(unknownId);
            expect(result).toEqual([]);
        });
    });

    describe('save', () => {
        it('should create a new email address if id is not set', async () => {
            const mailToCreate: EmailAddress<false> = EmailAddress.createNew({
                address: faker.internet.email(),
                priority: 5,
                spshPersonId: faker.string.uuid(),
                externalId: faker.string.uuid(),
                oxUserCounter: undefined,
            });
            const result: Result<EmailAddress<true>> = await sut.save(mailToCreate);

            expectOkResult(result);
            expect(result.value).toBeDefined();
            expect(result.value.id).toBeDefined();
            expect(result.value.address).toBe(mailToCreate.address);
        });

        it('should update an existing email address if id is set', async () => {
            const mailToCreate: EmailAddress<false> = EmailAddress.createNew({
                address: faker.internet.email(),
                priority: 1,
                spshPersonId: faker.string.uuid(),
                externalId: faker.string.uuid(),
                oxUserCounter: undefined,
            });
            const created: Result<EmailAddress<true>> = await sut.save(mailToCreate);
            expectOkResult(created);

            const updatedMail: EmailAddress<true> = EmailAddress.construct({
                ...created.value,
                priority: 99,
            });
            const updated: Result<EmailAddress<true>> = await sut.save(updatedMail);
            expectOkResult(updated);
            expect(updated.value).toBeDefined();
            expect(updated.value.priority).toBe(99);
        });

        it('should return EmailAddressNotFoundError if updating non-existing id', async () => {
            const mailToUpdate: EmailAddress<true> = EmailAddress.construct({
                id: faker.string.uuid(),
                address: faker.internet.email(),
                priority: 1,
                spshPersonId: faker.string.uuid(),
                createdAt: new Date(),
                updatedAt: new Date(),
                externalId: faker.string.uuid(),
                oxUserCounter: undefined,
                sortedStatuses: [],
            });
            const result: Result<EmailAddress<true>> = await sut.save(mailToUpdate);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EmailAddressNotFoundError);
        });
    });

    describe('shiftPriorities', () => {
        async function createMultipleEmails(n: number): Promise<EmailAddress<true>[]> {
            const spshPersonId: string = faker.string.uuid();
            const externalId: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.numeric(5);

            const mails: EmailAddress<false>[] = Array.from({ length: n }, (_: unknown, i: number) =>
                EmailAddress.createNew({
                    address: `${i}@example.com`,
                    priority: i,
                    externalId,
                    oxUserCounter,
                    spshPersonId,
                }),
            );

            const savedMails: Result<EmailAddress<true>>[] = await Promise.all(
                mails.map((m: EmailAddress<false>) => sut.save(m)),
            );

            for (const mail of savedMails) {
                expectOkResult(mail);
            }

            return (savedMails as { value: EmailAddress<true> }[]).map((r: { value: EmailAddress<true> }) => r.value);
        }

        it('should increment priorities for emails', async () => {
            const mails: EmailAddress<true>[] = await createMultipleEmails(4);
            const targetMail: EmailAddress<true> = mails[3]!;

            const result: Result<EmailAddress<true>[]> = await sut.shiftPriorities(targetMail, 0);

            expectOkResult(result);

            mails.forEach((em: EmailAddress<true>) => {
                em.priority += 1;
            });
            targetMail.priority = 0;

            for (const mail of mails) {
                expect(result.value).toContainEqual(
                    expect.objectContaining({
                        id: mail.id,
                        priority: mail.priority,
                    }),
                );
            }
        });

        it('should be able to move priority forwards', async () => {
            const mails: EmailAddress<true>[] = await createMultipleEmails(4);
            const targetMail: EmailAddress<true> = mails[0]!;

            const result: Result<EmailAddress<true>[]> = await sut.shiftPriorities(targetMail, 2);

            expectOkResult(result);

            targetMail.priority = 2;
            mails[2]!.priority = 3;
            mails[3]!.priority = 4;

            for (const mail of mails) {
                expect(result.value).toContainEqual(
                    expect.objectContaining({
                        id: mail.id,
                        priority: mail.priority,
                    }),
                );
            }
        });

        it("only shift addresses if needed (fill gaps but don't move unnecessarily)", async () => {
            const spshPersonId: string = faker.string.uuid();
            const externalId: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.numeric(5);

            async function createMail(prio: number): Promise<EmailAddress<true>> {
                const mail: EmailAddress<false> = EmailAddress.createNew({
                    address: `${prio}@example.com`,
                    priority: prio,
                    externalId,
                    oxUserCounter,
                    spshPersonId,
                });

                const saveResult: Result<EmailAddress<true>> = await sut.save(mail);
                expectOkResult(saveResult);
                return saveResult.value;
            }

            const mail0: EmailAddress<true> = await createMail(0);
            const mail1: EmailAddress<true> = await createMail(1);
            const mail2: EmailAddress<true> = await createMail(3);
            const mail3: EmailAddress<true> = await createMail(4);

            const result: Result<EmailAddress<true>[]> = await sut.shiftPriorities(mail3, 0);

            expectOkResult(result);

            expect(result.value).toContainEqual(
                expect.objectContaining({
                    id: mail3.id,
                    priority: 0,
                }),
            );
            expect(result.value).toContainEqual(
                expect.objectContaining({
                    id: mail0.id,
                    priority: 1,
                }),
            );
            expect(result.value).toContainEqual(
                expect.objectContaining({
                    id: mail1.id,
                    priority: 2,
                }),
            );
            // Should stay at priority 3
            expect(result.value).toContainEqual(
                expect.objectContaining({
                    id: mail2.id,
                    priority: 3,
                }),
            );
        });

        it('should return error if the target e-mail can not be found', async () => {
            const targetMail: EmailAddress<true> = EmailAddress.construct({
                id: faker.string.uuid(),
                address: faker.internet.email(),
                createdAt: new Date(),
                updatedAt: new Date(),
                externalId: faker.string.uuid(),
                oxUserCounter: faker.string.numeric(6),
                priority: 0,
                spshPersonId: faker.string.uuid(),
                sortedStatuses: [],
            });

            const result: Result<unknown> = await sut.shiftPriorities(targetMail, 0);

            expectErrResult(result);
            expect(result.error).toBeInstanceOf(EntityNotFoundError);
        });
    });

    describe('ensureStatusesAndCronDateForPerson', () => {
        it('should set markedForCron for priority >= 1', async () => {
            const personId: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.uuid();

            const cronDate: Date = faker.date.future();

            await createAndSaveMail(faker.internet.email(), 0, personId, oxUserCounter, undefined);
            await createAndSaveMail(faker.internet.email(), 1, personId, oxUserCounter, undefined);
            await createAndSaveMail(faker.internet.email(), 2, personId, oxUserCounter, undefined);

            await sut.ensureStatusesAndCronDateForPerson(personId, cronDate);

            const emailsAfterwards: EmailAddress<true>[] = await sut.findBySpshPersonIdSortedByPriorityAsc(personId);

            expect(emailsAfterwards[0]?.markedForCron).toBe(undefined);
            expect(emailsAfterwards[1]?.markedForCron).toBe(cronDate);
            expect(emailsAfterwards[2]?.markedForCron).toBe(cronDate);
        });

        it('should add deactive status to active mails with high priority', async () => {
            const personId: string = faker.string.uuid();
            const oxUserCounter: string = faker.string.uuid();

            const cronDate: Date = faker.date.future();

            const mail1: EmailAddress<true> = await createAndSaveMail(
                faker.internet.email(),
                2,
                personId,
                oxUserCounter,
                undefined,
            );
            await setStatus(mail1, EmailAddressStatusEnum.ACTIVE);
            const mail2: EmailAddress<true> = await createAndSaveMail(
                faker.internet.email(),
                2,
                personId,
                oxUserCounter,
                undefined,
            );
            await setStatus(mail2, EmailAddressStatusEnum.SUSPENDED);

            await vi.advanceTimersByTimeAsync(10);
            await sut.ensureStatusesAndCronDateForPerson(personId, cronDate);

            const emailsAfterwards: EmailAddress<true>[] = await sut.findBySpshPersonIdSortedByPriorityAsc(personId);

            expect(emailsAfterwards[0]?.sortedStatuses).toEqual([
                expect.objectContaining({ status: EmailAddressStatusEnum.DEACTIVE }),
                expect.objectContaining({ status: EmailAddressStatusEnum.ACTIVE }),
            ]);
            expect(emailsAfterwards[1]?.sortedStatuses).toEqual([
                expect.objectContaining({ status: EmailAddressStatusEnum.DEACTIVE }),
                expect.objectContaining({ status: EmailAddressStatusEnum.SUSPENDED }),
            ]);
        });
    });

    describe('delete', () => {
        it('should delete the email address by id', async () => {
            const mail: EmailAddress<true> = await createAndSaveMail();
            const found: Option<EmailAddress<true>> = await sut.findEmailAddress(mail.address);
            expect(found).toBeDefined();

            await sut.delete(mail);

            const afterDelete: Option<EmailAddress<true>> = await sut.findEmailAddress(mail.address);
            expect(afterDelete).toBeUndefined();
        });
    });

    describe('delete', () => {
        it('should delete the email address by id', async () => {
            const mail: EmailAddress<true> = await createAndSaveMail();
            const found: Option<EmailAddress<true>> = await sut.findEmailAddress(mail.address);
            expect(found).toBeDefined();

            await sut.delete(mail);

            const afterDelete: Option<EmailAddress<true>> = await sut.findEmailAddress(mail.address);
            expect(afterDelete).toBeUndefined();
        });
    });
});
