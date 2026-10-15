import { Test, type TestingModule } from '@nestjs/testing';
import { EmailAddress, EmailAddressStatus } from './email-address.js';
import { faker } from '@faker-js/faker';

describe('EmailAddress Aggregate', () => {
    let module: TestingModule;
    let personId: string;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        personId = faker.string.uuid();
    });

    describe('enabled', () => {
        describe('when email-address is enabled', () => {
            it('should return to true', () => {
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    faker.internet.email(),
                    EmailAddressStatus.ENABLED,
                );

                expect(emailAddress.enabled).toBeTruthy();
            });
        });

        describe('when email-address is NOT enabled', () => {
            it('should return to false', () => {
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    faker.internet.email(),
                    EmailAddressStatus.DISABLED,
                );

                expect(emailAddress.enabled).toBeFalsy();
            });
        });
    });

    describe('currentAddress', () => {
        describe('when email-address is enabled', () => {
            it('should return address', () => {
                const fakeEmail: string = faker.internet.email();
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    fakeEmail,
                    EmailAddressStatus.ENABLED,
                );

                const currentAddress: Option<string> = emailAddress.currentAddress;
                expect(currentAddress).toBeDefined();
                expect(currentAddress).toStrictEqual(fakeEmail);
            });
        });

        describe('when email-address is NOT enabled', () => {
            it('should return undefined', () => {
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    faker.internet.email(),
                    EmailAddressStatus.DISABLED,
                );

                expect(emailAddress.currentAddress).toBeFalsy();
            });
        });
    });

    describe('setFailed', () => {
        it('should set status to failed', () => {
            const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                personId,
                faker.internet.email(),
                EmailAddressStatus.ENABLED,
            );
            emailAddress.failed();

            expect(emailAddress.status).toStrictEqual(EmailAddressStatus.FAILED);
        });
    });

    describe('deletedFromLdap', () => {
        describe('when old status is NOT DELETED_FROM_OX', () => {
            it('should set status to DELETED_FROM_LDAD', () => {
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    faker.internet.email(),
                    EmailAddressStatus.DISABLED,
                );

                const newStatus: EmailAddressStatus = emailAddress.deletedFromLdap();

                expect(newStatus).toStrictEqual(EmailAddressStatus.DELETED_LDAP);
                expect(emailAddress.status).toStrictEqual(EmailAddressStatus.DELETED_LDAP);
            });
        });
        describe('when old status is DELETED_FROM_OX', () => {
            it('should set status to DELETED', () => {
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    faker.internet.email(),
                    EmailAddressStatus.DELETED_OX,
                );

                const newStatus: EmailAddressStatus = emailAddress.deletedFromLdap();

                expect(newStatus).toStrictEqual(EmailAddressStatus.DELETED);
                expect(emailAddress.status).toStrictEqual(EmailAddressStatus.DELETED);
            });
        });
    });

    describe('deletedFromOx', () => {
        describe('when old status is NOT DELETED_FROM_LDAD', () => {
            it('should set status to DELETED_FROM_OX', () => {
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    faker.internet.email(),
                    EmailAddressStatus.DISABLED,
                );

                const newStatus: EmailAddressStatus = emailAddress.deletedFromOx();

                expect(newStatus).toStrictEqual(EmailAddressStatus.DELETED_OX);
                expect(emailAddress.status).toStrictEqual(EmailAddressStatus.DELETED_OX);
            });
        });
        describe('when old status is DELETED_FROM_LDAD', () => {
            it('should set status to DELETED', () => {
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    faker.internet.email(),
                    EmailAddressStatus.DELETED_LDAP,
                );

                const newStatus: EmailAddressStatus = emailAddress.deletedFromOx();

                expect(newStatus).toStrictEqual(EmailAddressStatus.DELETED);
                expect(emailAddress.status).toStrictEqual(EmailAddressStatus.DELETED);
            });
        });
    });

    describe('setAddress', () => {
        describe('when called', () => {
            it('should set address', () => {
                const fakeEmail: string = faker.internet.email();
                const newFakeEmail: string = faker.internet.email();
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    fakeEmail,
                    EmailAddressStatus.ENABLED,
                );

                const result: string = emailAddress.setAddress(newFakeEmail);
                expect(result).toStrictEqual(newFakeEmail);
                expect(emailAddress.address).toStrictEqual(newFakeEmail);
            });
        });
    });

    describe('setOxUserId', () => {
        describe('when called', () => {
            it('should set oxUserId', () => {
                const oxUserId: string = faker.string.numeric();
                const fakeEmail: string = faker.internet.email();
                const emailAddress: EmailAddress<false> = EmailAddress.createNew(
                    personId,
                    fakeEmail,
                    EmailAddressStatus.ENABLED,
                );

                emailAddress.oxUserID = oxUserId;

                expect(emailAddress.oxUserID).toStrictEqual(oxUserId);
            });
        });
    });
});
