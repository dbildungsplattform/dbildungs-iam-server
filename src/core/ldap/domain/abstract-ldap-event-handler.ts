import { uniq } from 'lodash-es';
import { Personenkontext } from '../../../modules/personenkontext/domain/personenkontext.js';
import { OrganisationID, PersonID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { RolleRepo } from '../../../modules/rolle/repo/rolle.repo.js';
import { DBiamPersonenkontextRepo } from '../../../modules/personenkontext/persistence/dbiam-personenkontext.repo.js';
import { Rolle } from '../../../modules/rolle/domain/rolle.js';
import { ClassLogger } from '../../logging/class-logger.js';
import { OrganisationRepository } from '../../../modules/organisation/persistence/organisation.repository.js';
import { UemLdapOuError } from '../adapter/domain/error/uem-ldap-ou.error.js';

export abstract class AbstractLdapEventHandler {
    public constructor(
        protected readonly logger: ClassLogger,
        protected readonly organisationRepository: OrganisationRepository,
        protected readonly dbiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        protected readonly rolleRepo: RolleRepo,
    ) {}

    protected async findUemLdapOuForPersonId(personId: PersonID): Promise<Result<string>> {
        const personKontextWithUemRolle: Personenkontext<true>[] = await this.findUemKontexts(personId);
        if (!personKontextWithUemRolle[0]) {
            this.logger.warning(
                `Failed to find UEM LDAP OU for personId:${personId}, but person has no kontext with UEM rolle. Skipping LDAP update.`,
            );
            return { ok: false, error: new UemLdapOuError() };
        }
        const uemLdapOuResult: Result<string> = await this.resolveUemLdapOuOrThrow(
            personKontextWithUemRolle[0].organisationId,
        );
        return uemLdapOuResult;
    }

    protected async findUemKontexts(personId: PersonID): Promise<Personenkontext<true>[]> {
        const personKontexts: Option<Personenkontext<true>[]> =
            await this.dbiamPersonenkontextRepo.findByPerson(personId);
        const rollenIDs: RolleID[] = uniq(personKontexts.map((pk: Personenkontext<true>) => pk.rolleId));
        const rollen: Map<RolleID, Rolle<true>> = await this.rolleRepo.findByIds(rollenIDs);

        // Delete all rollen from map which do NOT have the UEM service provider
        for (const [rolleId, rolle] of rollen.entries()) {
            if (!rolle.hasUemServiceProvider()) {
                rollen.delete(rolleId);
            }
        }
        const personKontextWithUemRolle: Personenkontext<true>[] = personKontexts.filter((pk: Personenkontext<true>) =>
            rollen.has(pk.rolleId),
        );

        return personKontextWithUemRolle;
    }

    protected async getUemLdapOuForOrganisation(organisationId: OrganisationID): Promise<Result<string>> {
        const uemLdapOu: string | undefined =
            await this.organisationRepository.findUemLdapOuForOrganisation(organisationId);
        if (uemLdapOu) {
            return {
                ok: true,
                value: uemLdapOu,
            };
        }

        return { ok: false, error: new UemLdapOuError() };
    }

    protected async resolveUemLdapOuOrThrow(organisationId: OrganisationID): Promise<Result<string>> {
        try {
            return await this.getUemLdapOuForOrganisation(organisationId);
        } catch (error: unknown) {
            this.logger.error(
                `Error in getUemLdapOuForOrganisation: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        }
    }
}
