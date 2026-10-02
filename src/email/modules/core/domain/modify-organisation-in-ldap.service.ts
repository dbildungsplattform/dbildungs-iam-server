import { Injectable } from '@nestjs/common';
import { LdapUndiClientAdapter } from '../../ldap/adapter/domain/ldap-undi-client.adapter.js';

@Injectable()
export class ModifyOrganisationInLdapService {
    public constructor(private readonly ldapUndiClientAdapter: LdapUndiClientAdapter) {}

    public deleteOrganisationFromLdap(organisationId: string): Promise<Result<void>> {
        return this.ldapUndiClientAdapter.deleteGroup(organisationId);
    }

    public modifyOrganisationNameInLdap(
        organisationId: string,
        name: string,
    ): Promise<Result<void>> {
        return this.ldapUndiClientAdapter.updateGroup(organisationId, name);
    }
}
