import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { uniq } from 'lodash-es';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { PersonEmailIdentifier, PersonIdentifier } from '../../../core/logging/person-identifier.js';
import { OxServerConfig } from '../../../shared/config/ox-server.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { OrganisationID, PersonID, PersonUsername, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { OXGroupID, OXUserID } from '../../../shared/types/ox-ids.types.js';
import { EmailAddress, EmailAddressStatus } from '../../email/domain/email-address.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { Person } from '../../person/domain/person.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { OxMemberAlreadyInGroupError } from '../adapter/domain/error/ox-member-already-in-group.error.js';
import { OxSyncError } from '../adapter/domain/error/ox-sync.error.js';
import { generateOxUserChangedEvent, OxAdapter, OxUserChangedEventCreator } from '../adapter/domain/ox.adapter.js';
import {
    AddMemberToGroupAction,
    AddMemberToGroupResponse,
} from '../adapter/technical/actions/group/add-member-to-group.action.js';
import { ChangeUserAction } from '../adapter/technical/actions/user/change-user.action.js';
import { OxSendService } from '../adapter/technical/ox.send-service.js';

@Injectable()
export class OxSyncEventHandler {
    public ENABLED: boolean;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly oxService: OxSendService,
        private readonly oxAdapter: OxAdapter,
        private readonly emailRepo: EmailRepo,
        private readonly personRepository: PersonRepository,
        configService: ConfigService<ServerConfig>,
        private readonly dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly rolleRepo: RolleRepo,
        private readonly organisationRepository: OrganisationRepository,
    ) {
        const oxConfig: OxServerConfig = configService.getOrThrow<OxServerConfig>('OX');
        this.ENABLED = oxConfig.ENABLED;
    }

    private async getPerson(personId: PersonID, username: PersonUsername): Promise<PersonEmailIdentifier | undefined> {
        const personIdentifier: PersonIdentifier = {
            personId: personId,
            username: username,
        };
        const person: Option<Person<true>> = await this.personRepository.findById(personId);

        if (!person) {
            this.logger.errorPersonalized(`Person not found`, personIdentifier);
            return undefined;
        }
        if (!person.username) {
            this.logger.errorPersonalized(
                `Person has no username: Cannot Change Email-Address In OX`,
                personIdentifier,
            );
            return undefined;
        }
        if (!person.oxUserId) {
            this.logger.errorPersonalized(`Person has no OxUserId`, personIdentifier);
            return undefined;
        }

        return {
            personId: personId,
            username: username,
            oxUserId: person.oxUserId,
            oxUserName: person.username,
            person: person,
        };
    }

    public async sync(personId: PersonID, username: PersonUsername): Promise<void> {
        await this.changeOxUser(personId, username, generateOxUserChangedEvent);
        await this.changeUsersGroups(personId, username);
    }

    private async getOrganisationKennungen(
        personId: PersonID,
        username: PersonUsername,
    ): Promise<string[] | OxSyncError> {
        // Get all PKs
        const kontexte: Personenkontext<true>[] = await this.dBiamPersonenkontextRepo.findByPerson(personId);

        // Find all rollen and organisations
        const rollenIDs: RolleID[] = uniq(kontexte.map((pk: Personenkontext<true>) => pk.rolleId));
        const organisationIDs: OrganisationID[] = uniq(kontexte.map((pk: Personenkontext<true>) => pk.organisationId));
        const [rollen, organisations]: [Map<RolleID, Rolle<true>>, Map<OrganisationID, Organisation<true>>] =
            await Promise.all([
                this.rolleRepo.findByIds(rollenIDs),
                this.organisationRepository.findByIds(organisationIDs),
            ]);

        // Delete all rollen from map which are NOT LEHR
        for (const [rolleId, rolle] of rollen.entries()) {
            if (rolle.rollenart !== RollenArt.LEHR) {
                rollen.delete(rolleId);
            }
        }

        // Delete all organisations from map which are NOT typ SCHULE
        for (const [orgaId, orga] of organisations.entries()) {
            if (orga.typ !== OrganisationsTyp.SCHULE) {
                organisations.delete(orgaId);
            }
        }

        // Filter PKs for the remaining rollen with rollenArt LEHR and the remaining organisations with typ SCHULE
        const pksWithRollenArtLehrAndOrganisationSchule: Personenkontext<true>[] = kontexte.filter(
            (pk: Personenkontext<true>) => rollen.has(pk.rolleId) && organisations.has(pk.organisationId),
        );

        const schulenDstNrList: string[] = [];
        let schule: Organisation<true> | undefined;
        for (const pk of pksWithRollenArtLehrAndOrganisationSchule) {
            schule = organisations.get(pk.organisationId);
            if (!schule) {
                const errMsg: string = `Could not find organisation, orgaId:${pk.organisationId}, pkId:${pk.id}`;
                this.logger.error(errMsg);
                return new OxSyncError(errMsg);
            }
            if (!schule.kennung) {
                const errMsg: string = `Required kennung is missing on organisation, orgaId:${pk.organisationId}, pkId:${pk.id}`;
                this.logger.error(errMsg);
                return new OxSyncError(errMsg);
            }
            schulenDstNrList.push(schule.kennung);
        }
        this.logger.info(
            `Found orgaKennungen:${JSON.stringify(schulenDstNrList)}, for personId:${personId}, username:${username}`,
        );

        return schulenDstNrList;
    }

    private async changeOxUser(
        personId: PersonID,
        username: PersonUsername,
        eventCreator: OxUserChangedEventCreator,
    ): Promise<void> {
        const personIdentifier: PersonIdentifier = {
            personId: personId,
            username: username,
        };
        const personEmailIdentifier: PersonEmailIdentifier | undefined = await this.getPerson(personId, username);
        if (!personEmailIdentifier) {
            return this.logger.errorPersonalized('Fetching Person during OxSync failed', personIdentifier);
        }

        const mostRecentRequestedOrEnabledEA: Option<EmailAddress<true>> =
            await this.oxAdapter.getMostRecentEnabledOrRequestedEmailAddress(personId);
        if (!mostRecentRequestedOrEnabledEA) {
            return;
        } //logging is done in getMostRecentRequestedEmailAddress
        const currentEmailAddressString: string = mostRecentRequestedOrEnabledEA.address;

        const disabledEmailAddresses: EmailAddress<true>[] = await this.emailRepo.findByPersonSortedByUpdatedAtDesc(
            personId,
            EmailAddressStatus.DISABLED,
        );
        const aliases: string[] = disabledEmailAddresses.map((ea: EmailAddress<true>) => ea.address);
        aliases.push(currentEmailAddressString);

        this.logger.info(
            `Current aliases to be written:${JSON.stringify(aliases)}, personId:${personId}, username:${username}`,
        );

        const action: ChangeUserAction = this.oxAdapter.createChangeUserAction(
            personEmailIdentifier.oxUserId,
            username,
            aliases,
            personEmailIdentifier.person.vorname,
            personEmailIdentifier.person.familienname,
            personEmailIdentifier.person.username, //IS EXPLICITLY NOT SET to vorname+familienname
            currentEmailAddressString,
            currentEmailAddressString,
        );

        const result: Result<void, DomainError> = await this.oxService.send(action);

        if (!result.ok) {
            mostRecentRequestedOrEnabledEA.failed();
            await this.emailRepo.save(mostRecentRequestedOrEnabledEA);

            return this.logger.errorPersonalized(
                `Could not rewrite OxUser for oxUserId:${personEmailIdentifier.oxUserId}, error:${result.error.message}`,
                personIdentifier,
            );
        }

        this.logger.infoPersonalized(
            `Rewritten OxUser successfully, oxUserId:${personEmailIdentifier.oxUserId}, oxUsername:${username}, new email-address:${currentEmailAddressString}`,
            personIdentifier,
        );

        this.oxAdapter.publishOxUserChangedEvent2(
            eventCreator,
            personId,
            username,
            personEmailIdentifier.oxUserId,
            personEmailIdentifier.oxUserName,
            currentEmailAddressString,
        );
    }

    private async addOxUserToGroup(
        oxUserId: OXUserID,
        schuleDstrNr: string,
        personIdentifier: PersonIdentifier,
    ): Promise<void> {
        // Fetch or create the relevant OX group based on orgaKennung (group identifier)
        const oxGroupIdResult: Result<OXGroupID> = await this.oxAdapter.getExistingOxGroupByNameOrCreateOxGroup(
            OxAdapter.LEHRER_OX_GROUP_NAME_PREFIX + schuleDstrNr,
            OxAdapter.LEHRER_OX_GROUP_DISPLAY_NAME_PREFIX + schuleDstrNr,
        );

        if (!oxGroupIdResult.ok) {
            return this.logger.errorPersonalized(
                `Could not get OxGroup for schulenDstNr:${schuleDstrNr}`,
                personIdentifier,
            );
        }

        const addMemberToGroupAction: AddMemberToGroupAction = this.oxAdapter.createAddMemberToGroupAction(
            oxGroupIdResult.value,
            oxUserId,
        );

        const result: Result<AddMemberToGroupResponse, DomainError> = await this.oxService.send(addMemberToGroupAction);
        if (!result.ok && !(result.error instanceof OxMemberAlreadyInGroupError)) {
            this.logger.errorPersonalized(
                `Could not add oxUser to oxGroup, schulenDstNr:${schuleDstrNr}`,
                personIdentifier,
            );
        }
        this.logger.info(
            `Successfully added oxUser to oxGroup, oxUserId:${oxUserId}, oxGroupId:${oxGroupIdResult.value}`,
        );
    }

    private async changeUsersGroups(personId: PersonID, username: PersonUsername): Promise<void> {
        const personIdentifier: PersonIdentifier = {
            personId: personId,
            username: username,
        };
        const personEmailIdentifier: PersonEmailIdentifier | undefined = await this.getPerson(personId, username);
        if (!personEmailIdentifier) {
            return this.logger.errorPersonalized('Fetching Person during OxSync failed', personIdentifier);
        }

        const oxUserId: OXUserID = personEmailIdentifier.oxUserId;

        await this.oxAdapter.removeOxUserFromAllItsOxGroups(oxUserId, personIdentifier);

        const schulenDstNrList: string[] | OxSyncError = await this.getOrganisationKennungen(personId, username);
        if (schulenDstNrList instanceof OxSyncError) {
            return this.logger.errorPersonalized('Could not get organisations during OxSync', personIdentifier);
        }

        const promises: Promise<void>[] = schulenDstNrList.map((schulenDstNr: string) =>
            this.addOxUserToGroup(oxUserId, schulenDstNr, personIdentifier),
        );
        await Promise.allSettled(promises);
    }
}
