import { Test, TestingModule } from '@nestjs/testing';
import { faker } from '@faker-js/faker';
import { LoggingTestModule } from '../../../../../test/utils/index.js';
import { createMock, DeepMocked } from '../../../../../test/utils/createMock.js';
import { EmailConfigTestModule } from '../../../../../test/utils/email-config-test.module.js';
import { LdapUndiClientAdapter } from '../../ldap/adapter/domain/ldap-undi-client.adapter.js';
import { ModifyOrganisationInLdapService } from './modify-organisation-in-ldap.service.js';

describe('Modify Organisation In Ldap Service', () => {
    let modifyOrganisationInLdapService: ModifyOrganisationInLdapService;
    let ldapUndiClientAdapterMock: DeepMocked<LdapUndiClientAdapter>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule, EmailConfigTestModule],
            providers: [ModifyOrganisationInLdapService, LdapUndiClientAdapter],
        })
            .overrideProvider(LdapUndiClientAdapter)
            .useValue(createMock(LdapUndiClientAdapter))
            .compile();

        modifyOrganisationInLdapService = module.get(ModifyOrganisationInLdapService);
        ldapUndiClientAdapterMock = module.get(LdapUndiClientAdapter);
    });

    describe('deleteOrganisationFromLdap', () => {
        it('should return the result if deleteGroup succeeds', async () => {
            const organisationId: string = faker.string.uuid();
            const expectedResult: Result<void> = { ok: true, value: undefined };
            ldapUndiClientAdapterMock.deleteGroup.mockResolvedValue(expectedResult);
            const result: Result<void> =
                await modifyOrganisationInLdapService.deleteOrganisationFromLdap(organisationId);
            expect(result).toBe(expectedResult);
            expect(ldapUndiClientAdapterMock.deleteGroup).toHaveBeenCalledWith(organisationId);
        });
    });

    describe('modifyOrganisationNameInLdap', () => {
        it('should return the result if updateGroup succeeds', async () => {
            const organisationId: string = faker.string.uuid();
            const name: string = faker.company.name();
            const expectedResult: Result<void> = { ok: true, value: undefined };
            ldapUndiClientAdapterMock.updateGroup.mockResolvedValue(expectedResult);
            const result: Result<void> = await modifyOrganisationInLdapService.modifyOrganisationNameInLdap(
                organisationId,
                name,
            );
            expect(result).toBe(expectedResult);
            expect(ldapUndiClientAdapterMock.updateGroup).toHaveBeenCalledWith(organisationId, name);
        });
    });
});