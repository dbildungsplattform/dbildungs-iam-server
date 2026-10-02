import { Injectable } from '@nestjs/common';
import { OrganisationID, PersonID } from '../../../shared/types/aggregate-ids.types.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { EmailAddress, EmailAddressStatus } from './email-address.js';
import { EmailGenerator } from './email-generator.js';
import { EmailRepo } from '../persistence/email.repo.js';
import { Person } from '../../person/domain/person.js';
import { EntityNotFoundError } from '../../../shared/error/index.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { EmailDomainNotFoundError } from '../error/email-domain-not-found.error.js';

@Injectable()
export class EmailFactory {
    private emailGenerator: EmailGenerator;

    public constructor(
        private readonly emailRepo: EmailRepo,
        private readonly personRepository: PersonRepository,
        private readonly organisationRepository: OrganisationRepository,
    ) {
        this.emailGenerator = new EmailGenerator(this.emailRepo);
    }

    public construct(
        id: string,
        createdAt: Date,
        updatedAt: Date,
        personId: PersonID,
        address: string,
        enabled: EmailAddressStatus,
    ): EmailAddress<true> {
        return EmailAddress.construct(id, createdAt, updatedAt, personId, address, enabled);
    }

    public async createNew(personId: PersonID, organisationId: OrganisationID): Promise<Result<EmailAddress<false>>> {
        const person: Option<Person<true>> = await this.personRepository.findById(personId);
        if (!person) {
            return {
                ok: false,
                error: new EntityNotFoundError('Person', personId),
            };
        }
        const organisation: Option<Organisation<true>> = await this.organisationRepository.findById(organisationId);
        if (!organisation) {
            return {
                ok: false,
                error: new EntityNotFoundError('Organisation', organisationId),
            };
        }
        // FIXME: Won't work with OU. Can be removed?
        const emailDomain: string | undefined = await this.organisationRepository.findUemLdapOuForOrganisation(
            organisation.id,
        );
        if (!emailDomain) {
            return {
                ok: false,
                error: new EmailDomainNotFoundError(personId, organisation.id),
            };
        }

        const generatedAddressResult: Result<string> = await this.emailGenerator.generateAvailableAddress(
            person.vorname,
            person.familienname,
            emailDomain,
        );
        if (!generatedAddressResult.ok) {
            return {
                ok: false,
                error: generatedAddressResult.error,
            };
        }

        const newEmailAddress: EmailAddress<false> = EmailAddress.createNew(
            personId,
            generatedAddressResult.value,
            EmailAddressStatus.REQUESTED,
        );

        return {
            ok: true,
            value: newEmailAddress,
        };
    }

    public async createNewFromPersonIdAndDomain(
        personId: PersonID,
        emailDomain: string,
    ): Promise<Result<EmailAddress<false>>> {
        const person: Option<Person<true>> = await this.personRepository.findById(personId);
        if (!person) {
            return {
                ok: false,
                error: new EntityNotFoundError('Person', personId),
            };
        }

        const generatedAddressResult: Result<string> = await this.emailGenerator.generateAvailableAddress(
            person.vorname,
            person.familienname,
            emailDomain,
        );
        if (!generatedAddressResult.ok) {
            return {
                ok: false,
                error: generatedAddressResult.error,
            };
        }

        const newEmailAddress: EmailAddress<false> = EmailAddress.createNew(
            personId,
            generatedAddressResult.value,
            EmailAddressStatus.REQUESTED,
        );

        return {
            ok: true,
            value: newEmailAddress,
        };
    }
}
