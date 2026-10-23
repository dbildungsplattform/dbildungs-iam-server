import { faker } from '@faker-js/faker';
import { type INestApplication } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS, DoFactory } from '../../../../test/utils/index.js';
import { EventModule } from '../../../core/eventbus/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { EntityCouldNotBeUpdated } from '../../../shared/error/entity-could-not-be-updated.error.js';
import { DisabledOxUserChangedEvent } from '../../../shared/events/ox/disabled-ox-user-changed.event.js';
import { OxSyncUserCreatedEvent } from '../../../shared/events/ox/ox-sync-user-created.event.js';
import { OxUserChangedEvent } from '../../../shared/events/ox/ox-user-changed.event.js';
import { type PersonID } from '../../../shared/types/index.js';
import {
    type OXContextID,
    type OXContextName,
    type OXUserID,
    type OXUserName,
} from '../../../shared/types/ox-ids.types.js';
import { GlobalValidationPipe } from '../../../shared/validation/global-validation.pipe.js';
import { EmailModule } from '../email.module.js';
import { EmailRepo } from '../persistence/email.repo.js';
import { EmailAddress, EmailAddressStatus } from './email-address.js';
import { EmailEventHandler } from './email-event-handler.js';

function getEmail(address?: string, status?: EmailAddressStatus): EmailAddress<true> {
    const fakePersonId: PersonID = faker.string.uuid();
    const fakeEmailAddressId: string = faker.string.uuid();
    return EmailAddress.construct(
        fakeEmailAddressId,
        faker.date.past(),
        faker.date.recent(),
        fakePersonId,
        address ?? faker.internet.email(),
        status ?? EmailAddressStatus.ENABLED,
    );
}

describe('EmailEventHandler', () => {
    let app: INestApplication;

    let emailEventHandler: EmailEventHandler;
    let emailRepoMock: DeepMocked<EmailRepo>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                EmailModule,
                EventModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: false }),
            ],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
            ],
        })
            .overrideProvider(EmailRepo)
            .useValue(createMock(EmailRepo))
            .overrideProvider(ClassLogger)
            .useValue(createMock(ClassLogger))
            .compile();

        emailEventHandler = module.get(EmailEventHandler);
        emailRepoMock = module.get(EmailRepo);
        loggerMock = module.get(ClassLogger);

        app = module.createNestApplication();
        await app.init();
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        emailEventHandler.OX_ENABLED = true;
    });

    describe('handleOxSyncUserCreatedEvent and handleOxUserChangedEvent', () => {
        let fakePersonId: string;
        let fakeKeycloakUsername: string;
        let fakeOXUserId: OXUserID;
        let fakeOXUserName: OXUserName;
        let fakeContextId: OXContextID;
        let fakeOXContextName: OXContextName;
        let fakeEmail: string;
        let event: OxSyncUserCreatedEvent;

        beforeEach(() => {
            fakePersonId = faker.string.uuid();
            fakeKeycloakUsername = faker.internet.username();
            fakeOXUserId = faker.string.numeric();
            fakeContextId = faker.string.numeric();
            fakeOXUserName = fakeKeycloakUsername;
            fakeOXContextName = 'context1';
            fakeEmail = faker.internet.email();
            event = new OxSyncUserCreatedEvent(
                fakePersonId,
                fakeKeycloakUsername,
                fakeOXUserId,
                fakeOXUserName,
                fakeContextId,
                fakeOXContextName,
                fakeEmail,
            );
        });

        describe('handleOxSyncUserCreatedEvent', () => {
            beforeEach(() => {
                event = new OxSyncUserCreatedEvent(
                    fakePersonId,
                    fakeKeycloakUsername,
                    fakeOXUserId,
                    fakeOXUserName,
                    fakeContextId,
                    fakeOXContextName,
                    fakeEmail,
                );
            });

            describe('when email cannot be found by personId', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(undefined);

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, enabling not necessary`,
                    );
                });
            });

            describe('when email-address from OX and requested email-address are not equal', () => {
                it('should log error', async () => {
                    const emailAddress: string = faker.internet.email();
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, emailAddress),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(DoFactory.createEmailAddress<true>(true));

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.warning).toHaveBeenCalledWith(
                        `Mismatch between REQUESTED(${emailAddress}) and received(${event.primaryEmail}) address from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                    expect(loggerMock.warning).toHaveBeenLastCalledWith(
                        `Overriding ${emailAddress} with ${event.primaryEmail}) from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });

            describe('when persisting changes to email-address fails', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, fakeEmail),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeUpdated('EmailAddress', '1'));

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not ENABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, error:EmailAddress with ID 1 could not be updated`,
                    );
                });
            });

            describe('when changing email status is successful', () => {
                it('should log info', async () => {
                    const emailMock: EmailAddress<true> = DoFactory.createEmailAddress<true>(true, fakeEmail);
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(emailMock);

                    emailRepoMock.save.mockResolvedValueOnce(emailMock);

                    await emailEventHandler.handleOxSyncUserCreatedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Changed email-address:${fakeEmail} from REQUESTED to ENABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });
        });

        describe('handleOxUserChangedEvent', () => {
            beforeEach(() => {
                event = new OxUserChangedEvent(
                    fakePersonId,
                    fakeKeycloakUsername,
                    fakeOXUserId,
                    fakeOXUserName,
                    fakeContextId,
                    fakeOXContextName,
                    fakeEmail,
                );
            });

            describe('when email cannot be found by personId', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(undefined);

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, enabling not necessary`,
                    );
                });
            });

            describe('when email-address from OX and requested email-address are not equal', () => {
                it('should log error', async () => {
                    const emailAddress: string = faker.internet.email();
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, emailAddress),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(DoFactory.createEmailAddress<true>(true));

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.warning).toHaveBeenCalledWith(
                        `Mismatch between REQUESTED(${emailAddress}) and received(${event.primaryEmail}) address from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                    expect(loggerMock.warning).toHaveBeenLastCalledWith(
                        `Overriding ${emailAddress} with ${event.primaryEmail}) from OX, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });

            describe('when persisting changes to email-address fails', () => {
                it('should log error', async () => {
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                        DoFactory.createEmailAddress<true>(true, fakeEmail),
                    );

                    emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeUpdated('EmailAddress', '1'));

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.error).toHaveBeenLastCalledWith(
                        `Could not ENABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, error:EmailAddress with ID 1 could not be updated`,
                    );
                });
            });

            describe('when changing email status is successful', () => {
                it('should log info', async () => {
                    const emailMock: EmailAddress<true> = DoFactory.createEmailAddress<true>(true, fakeEmail);
                    emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(emailMock);

                    emailRepoMock.save.mockResolvedValueOnce(emailMock);

                    await emailEventHandler.handleOxUserChangedEvent(event);

                    expect(loggerMock.info).toHaveBeenLastCalledWith(
                        `Changed email-address:${fakeEmail} from REQUESTED to ENABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}`,
                    );
                });
            });
        });
    });

    describe('handleDisabledOxUserChangedEvent', () => {
        let fakePersonId: string;
        let fakeKeycloakUsername: string;
        let fakeOXUserId: OXUserID;
        let fakeOXUserName: OXUserName;
        let fakeOXContextId: OXContextID;
        let fakeOXContextName: OXContextName;
        let fakeEmail: string;
        let event: DisabledOxUserChangedEvent;

        beforeEach(() => {
            fakePersonId = faker.string.uuid();
            fakeKeycloakUsername = faker.internet.username();
            fakeOXUserId = faker.string.numeric();
            fakeOXUserName = fakeKeycloakUsername;
            fakeOXContextId = faker.string.numeric();
            fakeOXContextName = 'context1';
            fakeEmail = faker.internet.email();
            event = new DisabledOxUserChangedEvent(
                fakePersonId,
                fakeKeycloakUsername,
                fakeOXUserId,
                fakeOXUserName,
                fakeOXContextId,
                fakeOXContextName,
                fakeEmail,
            );
        });

        describe('when email with REQUESTED status cannot be found by personId', () => {
            it('should log error', async () => {
                emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(undefined);

                await emailEventHandler.handleDisabledOxUserChangedEvent(event);

                expect(loggerMock.error).toHaveBeenLastCalledWith(
                    `Cannot find REQUESTED email-address for person with personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}, DISABLING not possible`,
                );
            });
        });

        describe('when persisting changes to email-address fails', () => {
            it('should log error', async () => {
                emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                    DoFactory.createEmailAddress<true>(true, fakeEmail),
                );

                emailRepoMock.save.mockResolvedValueOnce(new EntityCouldNotBeUpdated('EmailAddress', '1'));

                await emailEventHandler.handleDisabledOxUserChangedEvent(event);

                expect(loggerMock.error).toHaveBeenLastCalledWith(
                    `Could not DISABLE email for personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${fakeOXUserId}, error:EmailAddress with ID 1 could not be updated`,
                );
            });
        });

        describe('when creation and persisting succeeds', () => {
            it('should log info', async () => {
                emailRepoMock.findRequestedByPerson.mockResolvedValueOnce(
                    DoFactory.createEmailAddress<true>(true, fakeEmail),
                );

                emailRepoMock.save.mockResolvedValueOnce(getEmail(fakeEmail, EmailAddressStatus.DISABLED));

                await emailEventHandler.handleDisabledOxUserChangedEvent(event);

                expect(loggerMock.info).toHaveBeenLastCalledWith(
                    `Changed email-address:${fakeEmail} from REQUESTED to DISABLED, personId:${event.personId}, username:${event.keycloakUsername}, oxUserId:${event.oxUserId}`,
                );
            });
        });
    });
});
