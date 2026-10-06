import { vi } from 'vitest';
import { APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { DEFAULT_TIMEOUT_FOR_TESTCONTAINERS, LoggingTestModule } from '../../../../../../test/utils/index.js';
import { GlobalValidationPipe } from '../../../../../shared/validation/global-validation.pipe.js';
import { faker } from '@faker-js/faker';
import { EmailWriteController } from './email-write.controller.js';
import { createMock, DeepMocked } from '../../../../../../test/utils/createMock.js';
import { SetEmailAddressForSpshPersonService } from '../../domain/set-email-address-for-spsh-person.service.js';
import { SetEmailAddressForSpshPersonBodyParams } from '../dtos/params/set-email-address-for-spsh-person.bodyparams.js';
import { ClassLogger } from '../../../../../core/logging/class-logger.js';
import { DeleteEmailsAddressesForSpshPersonService } from '../../domain/delete-email-adresses-for-spsh-person.service.js';
import { SetEmailSuspendedService } from '../../domain/set-email-suspended.service.js';
import { SetEmailAddressForSpshPersonPathParams } from '../dtos/params/set-email-address-for-spsh-person.pathparams.js';
import { DeleteEmailAddressesForSpshPersonPathParams } from '../dtos/params/delete-email-addresses-for-spsh-person.pathparams.js';
import { SetEmailAddressesSuspendedPathParams } from '../dtos/params/set-email-addresses-suspended.pathparams.js';
import { EmailConfigTestModule } from '../../../../../../test/utils/email-config-test.module.js';
import { ModifyOrganisationInLdapService } from '../../domain/modify-organisation-in-ldap.service.js';
import { SetEmailAddressesSuspendedBodyParams } from '../dtos/params/set-email-addresses-suspended.bodyparams.js';
import { UpdateOrganisationBodyParams } from '../dtos/params/update-organisation.bodyparams.js';
import { UpdateOrganisationPathParams } from '../dtos/params/update-organisation.pathparams.js';

describe('Email Write Controller', () => {
    let emailWriteController: EmailWriteController;
    let setEmailAddressForSpshPersonServiceMock: DeepMocked<SetEmailAddressForSpshPersonService>;
    let setEmailSuspendedServiceMock: DeepMocked<SetEmailSuspendedService>;
    let deleteEmailsAddressesForSpshPersonServiceMock: DeepMocked<DeleteEmailsAddressesForSpshPersonService>;
    let modifyOrganisationInLdapServiceMock: DeepMocked<ModifyOrganisationInLdapService>;
    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule, EmailConfigTestModule],
            providers: [
                {
                    provide: APP_PIPE,
                    useClass: GlobalValidationPipe,
                },
                EmailWriteController,
                SetEmailAddressForSpshPersonService,
                ModifyOrganisationInLdapService,
                SetEmailSuspendedService,
                DeleteEmailsAddressesForSpshPersonService,
                ClassLogger,
            ],
        })
            .overrideProvider(SetEmailAddressForSpshPersonService)
            .useValue(createMock(SetEmailAddressForSpshPersonService))
            .overrideProvider(DeleteEmailsAddressesForSpshPersonService)
            .useValue(createMock<DeleteEmailsAddressesForSpshPersonService>(DeleteEmailsAddressesForSpshPersonService))
            .overrideProvider(SetEmailSuspendedService)
            .useValue(createMock<SetEmailSuspendedService>(SetEmailSuspendedService))
            .overrideProvider(ModifyOrganisationInLdapService)
            .useValue(createMock(ModifyOrganisationInLdapService))
            .overrideProvider(ClassLogger)
            .useValue(createMock<ClassLogger>(ClassLogger))
            .compile();

        emailWriteController = module.get(EmailWriteController);
        setEmailAddressForSpshPersonServiceMock = module.get(SetEmailAddressForSpshPersonService);
        setEmailSuspendedServiceMock = module.get(SetEmailSuspendedService);
        deleteEmailsAddressesForSpshPersonServiceMock = module.get(DeleteEmailsAddressesForSpshPersonService);
        modifyOrganisationInLdapServiceMock = module.get(ModifyOrganisationInLdapService);
        loggerMock = module.get(ClassLogger);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('setEmailAddressForSpshPerson', () => {
        it('should resolve immediatly if setEmailAddressForSpshPerson succeeds', () => {
            const spshPersonId: string = faker.string.uuid();
            const bodyParams: SetEmailAddressForSpshPersonBodyParams = new SetEmailAddressForSpshPersonBodyParams();
            Object.assign(bodyParams, {
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: faker.string.uuid(),
                organisationen: [],
                spshUsername: faker.internet.username(),
            });
            setEmailAddressForSpshPersonServiceMock.setEmailAddressForSpshPerson.mockResolvedValue();
            const requestParams: SetEmailAddressForSpshPersonPathParams = new SetEmailAddressForSpshPersonPathParams();
            Object.assign(requestParams, { spshPersonId });
            const result: void = emailWriteController.setEmailForPerson(requestParams, bodyParams);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(setEmailAddressForSpshPersonServiceMock.setEmailAddressForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                ...bodyParams,
            });
        });

        it('should resolve immediatly if setEmailAddressForSpshPerson fails', () => {
            const spshPersonId: string = faker.string.uuid();
            const bodyParams: SetEmailAddressForSpshPersonBodyParams = new SetEmailAddressForSpshPersonBodyParams();
            Object.assign(bodyParams, {
                firstName: faker.person.firstName(),
                lastName: faker.person.lastName(),
                spshServiceProviderId: faker.string.uuid(),
                organisationen: [],
                spshUsername: faker.internet.username(),
            });
            const requestParams: SetEmailAddressForSpshPersonPathParams = new SetEmailAddressForSpshPersonPathParams();
            Object.assign(requestParams, { spshPersonId });
            setEmailAddressForSpshPersonServiceMock.setEmailAddressForSpshPerson.mockRejectedValue(
                new Error('Test error'),
            );
            const result: void = emailWriteController.setEmailForPerson(requestParams, bodyParams);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(setEmailAddressForSpshPersonServiceMock.setEmailAddressForSpshPerson).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                ...bodyParams,
            });
        });
    });

    describe('deleteEmailsForPerson', () => {
        it('should resolve immediately if deleteEmailAddressesForSpshPerson succeeds', () => {
            const spshPersonId: string = faker.string.uuid();
            deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson.mockResolvedValue();
            const params: DeleteEmailAddressesForSpshPersonPathParams =
                new DeleteEmailAddressesForSpshPersonPathParams();
            Object.assign(params, { spshPersonId });
            const result: void = emailWriteController.deleteEmailsForPerson(params);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).toHaveBeenCalledWith({ spshPersonId });
        });

        it('should log error if deleteEmailAddressesForSpshPerson fails', () => {
            const spshPersonId: string = faker.string.uuid();
            const error: Error = new Error('Delete failed');
            deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson.mockRejectedValue(error);
            const params: DeleteEmailAddressesForSpshPersonPathParams =
                new DeleteEmailAddressesForSpshPersonPathParams();
            Object.assign(params, { spshPersonId });
            const result: void = emailWriteController.deleteEmailsForPerson(params);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(
                deleteEmailsAddressesForSpshPersonServiceMock.deleteEmailAddressesForSpshPerson,
            ).toHaveBeenCalledWith({ spshPersonId });
        });
    });

    describe('deleteOrganisation', () => {
        it('should resolve immediately if deleteOrganisationFromLdap succeeds', () => {
            const organisationId: string = faker.string.uuid();
            modifyOrganisationInLdapServiceMock.deleteOrganisationFromLdap.mockResolvedValue({
                ok: true,
                value: undefined,
            });
            const result: void = emailWriteController.deleteOrganisation(organisationId);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(modifyOrganisationInLdapServiceMock.deleteOrganisationFromLdap).toHaveBeenCalledWith(
                organisationId,
            );
        });

        it('should log error if deleteOrganisationFromLdap fails', async () => {
            const organisationId: string = faker.string.uuid();
            const error: Error = new Error('Delete failed');
            modifyOrganisationInLdapServiceMock.deleteOrganisationFromLdap.mockRejectedValue(error);
            const result: void = emailWriteController.deleteOrganisation(organisationId);
            expect(result).toBeUndefined();
            await vi.runAllTimersAsync();
            expect(modifyOrganisationInLdapServiceMock.deleteOrganisationFromLdap).toHaveBeenCalledWith(
                organisationId,
            );
            expect(loggerMock.error).toHaveBeenCalledWith(
                `Error in background LDAP organisation deletion: ${error.message}`,
            );
        });
    });

    describe('updateOrganisation', () => {
        it('should resolve immediately if modifyOrganisationNameInLdap succeeds', () => {
            const organisationId: string = faker.string.uuid();
            const params: UpdateOrganisationPathParams = new UpdateOrganisationPathParams();
            const bodyParams: UpdateOrganisationBodyParams = { name: faker.company.name() };
            Object.assign(params, { organisationId });
            modifyOrganisationInLdapServiceMock.modifyOrganisationNameInLdap.mockResolvedValue({
                ok: true,
                value: undefined,
            });
            const result: void = emailWriteController.updateOrganisation(params, bodyParams);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(modifyOrganisationInLdapServiceMock.modifyOrganisationNameInLdap).toHaveBeenCalledWith(
                organisationId,
                bodyParams.name,
            );
        });

        it('should log error if modifyOrganisationNameInLdap fails', async () => {
            const organisationId: string = faker.string.uuid();
            const params: UpdateOrganisationPathParams = new UpdateOrganisationPathParams();
            const bodyParams: UpdateOrganisationBodyParams = { name: faker.company.name() };
            Object.assign(params, { organisationId });
            const error: Error = new Error('Update failed');
            modifyOrganisationInLdapServiceMock.modifyOrganisationNameInLdap.mockRejectedValue(error);
            const result: void = emailWriteController.updateOrganisation(params, bodyParams);
            expect(result).toBeUndefined();
            await vi.runAllTimersAsync();
            expect(modifyOrganisationInLdapServiceMock.modifyOrganisationNameInLdap).toHaveBeenCalledWith(
                organisationId,
                bodyParams.name,
            );
            expect(loggerMock.error).toHaveBeenCalledWith(
                `Error in background LDAP organisation update: ${error.message}`,
            );
        });
    });

    describe('setEmailsSuspendedForSpshPerson', () => {
        it('should resolve immediatly if setEmailsSuspended succeeds', () => {
            const spshPersonId: string = faker.string.uuid();
            setEmailSuspendedServiceMock.setEmailsSuspended.mockResolvedValue();
            const params: SetEmailAddressesSuspendedPathParams = new SetEmailAddressesSuspendedPathParams();
            const bodyParams: SetEmailAddressesSuspendedBodyParams = { gesperrt: true };
            Object.assign(params, { spshPersonId });
            const result: void = emailWriteController.setEmailsSuspended(params, bodyParams);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(setEmailSuspendedServiceMock.setEmailsSuspended).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                gesperrt: bodyParams.gesperrt,
            });
        });

        it('should resolve immediatly if setEmailsSuspended fails', () => {
            const spshPersonId: string = faker.string.uuid();
            setEmailSuspendedServiceMock.setEmailsSuspended.mockRejectedValue(new Error('Test error'));
            const params: SetEmailAddressesSuspendedPathParams = new SetEmailAddressesSuspendedPathParams();
            const bodyParams: SetEmailAddressesSuspendedBodyParams = { gesperrt: true };
            Object.assign(params, { spshPersonId });
            const result: void = emailWriteController.setEmailsSuspended(params, bodyParams);
            expect(result).toBeUndefined();
            vi.runAllTimers();
            expect(setEmailSuspendedServiceMock.setEmailsSuspended).toHaveBeenCalledWith({
                spshPersonId: spshPersonId,
                gesperrt: bodyParams.gesperrt,
            });
        });
    });
});
