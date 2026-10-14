import { Injectable } from '@nestjs/common';
import { Ok } from '../../../../shared/util/result.js';
import { LdapUndiClientAdapter } from '../../ldap/adapter/domain/ldap-undi-client.adapter.js';

@Injectable()
export class ModifyOrganisationInLdapService {
    public constructor(private readonly ldapUndiClientAdapter: LdapUndiClientAdapter) {}

    public async deleteOrganisationFromLdap(organisationId: string): Promise<Result<void>> {
        if (!this.ldapUndiClientAdapter.useLdap()) {
            return Ok();
        }

        return this.ldapUndiClientAdapter.deleteGroup(organisationId);
    }

    public async modifyOrganisationNameInLdap(organisationId: string, name: string): Promise<Result<void>> {
        if (!this.ldapUndiClientAdapter.useLdap()) {
            return Ok();
        }

        return this.ldapUndiClientAdapter.updateGroup(organisationId, name);
    }
}
