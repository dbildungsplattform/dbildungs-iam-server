import { faker } from '@faker-js/faker';
import { EmailDomain } from '../../src/email/modules/core/domain/email-domain.js';
import { EmailAddress, EmailAddressStatus } from '../../src/modules/email/domain/email-address.js';
import { ImportDataItem } from '../../src/modules/import/domain/import-data-item.js';
import { ImportVorgang } from '../../src/modules/import/domain/import-vorgang.js';
import { ImportStatus } from '../../src/modules/import/domain/import.enums.js';
import { ImportDataItemStatus } from '../../src/modules/import/domain/importDataItem.enum.js';
import { User } from '../../src/modules/keycloak-administration/domain/user.js';
import { Meldung } from '../../src/modules/meldung/domain/meldung.js';
import { OrganisationsTyp, Traegerschaft } from '../../src/modules/organisation/domain/organisation.enums.js';
import { Organisation } from '../../src/modules/organisation/domain/organisation.js';
import { Person } from '../../src/modules/person/domain/person.js';
import {
    Jahrgangsstufe,
    Personenstatus,
    SichtfreigabeType,
} from '../../src/modules/personenkontext/domain/personenkontext.enums.js';
import { Personenkontext } from '../../src/modules/personenkontext/domain/personenkontext.js';
import { RollenArt } from '../../src/modules/rolle/domain/rolle.enums.js';
import { Rolle as RolleAggregate } from '../../src/modules/rolle/domain/rolle.js';
import { Rollenerweiterung } from '../../src/modules/rolle/domain/rollenerweiterung.js';
import { RollenSystemRecht } from '../../src/modules/rolle/domain/systemrecht.js';
import {
    ServiceProviderKategorie,
    ServiceProviderMerkmal,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from '../../src/modules/service-provider/domain/service-provider.enum.js';
import { ServiceProvider } from '../../src/modules/service-provider/domain/service-provider.js';
import { DoBase } from '../../src/shared/types/do-base.js';

// <-- Not part of the domain, need to be fixed! -->
import { EmailAddress as MicroserviceEmailAddress } from '../../src/email/modules/core/domain/email-address.js';
import { EmailAddressStatusEnum } from '../../src/email/modules/core/persistence/email-address-status.entity.js';
// <-- Fix end -->

export class DoFactory {
    public static createMany<T extends DoBase<boolean>>(
        this: void,
        n: number,
        withId: T extends DoBase<true> ? true : false,
        generate: (withId: T extends DoBase<true> ? true : false, props?: Partial<T>) => T,
        props?: Partial<T>,
    ): T[] {
        return Array.from({ length: n }, (_v: unknown, _k: number) => generate(withId, props));
    }

    public static createPerson<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<Person<WasPersisted>>,
    ): Person<WasPersisted> {
        const person: Partial<Person<WasPersisted>> = {
            keycloakUserId: faker.string.uuid(),
            mandant: faker.string.uuid(),
            familienname: faker.person.lastName(),
            vorname: faker.person.fullName(),
            id: withId ? faker.string.uuid() : undefined,
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            personalnummer: faker.string.numeric({ length: 7 }),
            revision: '1',
            externalIds: {},
            username: withId ? faker.internet.username() : undefined,
        };
        person.istTechnisch = false;
        return Object.assign(Object.create(Person.prototype) as Person<boolean>, person, props);
    }

    public static createOrganisation<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<Organisation<false>>,
    ): Organisation<WasPersisted> {
        const organisation: Partial<Organisation<WasPersisted>> = {
            id: withId ? faker.string.uuid() : undefined,
            kennung: faker.lorem.word(),
            name: faker.company.name(),
            namensergaenzung: faker.company.name(),
            kuerzel: faker.lorem.word(),
            typ: OrganisationsTyp.SONSTIGE,
            traegerschaft: Traegerschaft.SONSTIGE,
            emailDomain: faker.internet.email(),
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
        };
        return Object.assign(Object.create(Organisation.prototype) as Organisation<boolean>, organisation, props);
    }

    public static createUser<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<User<WasPersisted>>,
    ): User<WasPersisted> {
        const user: User<false> = {
            id: withId ? faker.string.uuid() : undefined,
            createdDate: withId ? faker.date.past() : undefined,
            username: faker.internet.username(),
            email: faker.internet.email(),
            externalSystemIDs: {},
            enabled: true,
        };

        return Object.assign(Object.create(User.prototype) as User<boolean>, user, props);
    }

    public static createPersonenkontext<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<Personenkontext<WasPersisted>>,
    ): Personenkontext<WasPersisted> {
        const pk: Partial<Personenkontext<false>> = {
            id: withId ? faker.string.uuid() : undefined,
            mandant: faker.string.uuid(),
            personId: faker.string.uuid(),
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            organisationId: faker.string.uuid(),
            revision: '1',
            rolleId: faker.string.uuid(),
            jahrgangsstufe: Jahrgangsstufe.JAHRGANGSSTUFE_1,
            personenstatus: Personenstatus.AKTIV,
            username: 'username',
            sichtfreigabe: SichtfreigabeType.JA,
            loeschungZeitpunkt: faker.date.anytime(),
            befristung: faker.date.anytime(),
        };

        return Object.assign(Object.create(Personenkontext.prototype) as Personenkontext<boolean>, pk, props);
    }

    public static createRolle<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<RolleAggregate<WasPersisted>>,
    ): RolleAggregate<WasPersisted> {
        const rolle: Partial<RolleAggregate<WasPersisted>> = {
            name: faker.person.jobTitle(),
            administeredBySchulstrukturknoten: faker.string.uuid(),
            rollenart: faker.helpers.enumValue(RollenArt),
            merkmale: [],
            systemrechte: [RollenSystemRecht.PERSONEN_VERWALTEN],
            serviceProviderIds: [],
            id: withId ? faker.string.uuid() : undefined,
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            serviceProviderData: [],
        };
        return Object.assign(Object.create(RolleAggregate.prototype) as RolleAggregate<boolean>, rolle, props);
    }

    public static createServiceProvider<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<ServiceProvider<WasPersisted>>,
    ): ServiceProvider<WasPersisted> {
        const serviceProvider: Partial<ServiceProvider<WasPersisted>> = {
            id: withId ? faker.string.uuid() : undefined,
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            name: faker.word.noun(),
            target: ServiceProviderTarget.URL,
            url: faker.internet.url(),
            kategorie: faker.helpers.enumValue(ServiceProviderKategorie),
            logoId: undefined,
            logoMimeType: 'image/png',
            // 1x1 black PNG
            logo: Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAAAAA3bvkkAAAACklEQVR4AWNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==',
                'base64',
            ),
            providedOnSchulstrukturknoten: faker.string.uuid(),
            externalSystem: ServiceProviderSystem.NONE,
            requires2fa: true,
            merkmale: [ServiceProviderMerkmal.NACHTRAEGLICH_ZUWEISBAR],
            rollenartenWhitelist: [RollenArt.LEHR],
        };
        return Object.assign(
            Object.create(ServiceProvider.prototype) as ServiceProvider<boolean>,
            serviceProvider,
            props,
        );
    }

    public static createMeldung<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<Meldung<WasPersisted>>,
    ): Meldung<WasPersisted> {
        const meldung: Partial<Meldung<WasPersisted>> = {
            id: withId ? faker.string.uuid() : undefined,
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            inhalt: faker.word.noun(),
            revision: 1,
        };
        return Object.assign(Object.create(Meldung.prototype) as Meldung<boolean>, meldung, props);
    }

    public static createOrganisationAggregate<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        params: Partial<Organisation<boolean>> = {},
    ): Organisation<WasPersisted> {
        const organisation: Organisation<WasPersisted> = Organisation.construct<boolean>(
            withId ? faker.string.uuid() : undefined,
            withId ? faker.date.past() : undefined,
            withId ? faker.date.recent() : undefined,
            params.version ?? 1,
            faker.string.uuid(),
            faker.string.uuid(),
            faker.lorem.word(),
            faker.lorem.word(),
            faker.lorem.word(),
            faker.string.uuid(),
            faker.helpers.enumValue(OrganisationsTyp),
            faker.helpers.enumValue(Traegerschaft),
        );

        Object.assign(organisation, params);

        return organisation;
    }

    public static createImportDataItem<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<ImportDataItem<WasPersisted>>,
    ): ImportDataItem<WasPersisted> {
        const objectVallue: Partial<ImportDataItem<WasPersisted>> = {
            importvorgangId: faker.string.uuid(),
            nachname: faker.person.lastName(),
            vorname: faker.person.fullName(),
            id: withId ? faker.string.uuid() : undefined,
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            klasse: faker.lorem.word({ length: 2 }),
            personalnummer: undefined,
            status: ImportDataItemStatus.PENDING,
        };
        return Object.assign(Object.create(ImportDataItem.prototype) as ImportDataItem<boolean>, objectVallue, props);
    }

    public static createImportVorgang<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<ImportVorgang<WasPersisted>>,
    ): ImportVorgang<WasPersisted> {
        const objectVallue: Partial<ImportVorgang<WasPersisted>> = {
            id: withId ? faker.string.uuid() : undefined,
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            importByUsername: faker.internet.username(),
            rollename: faker.lorem.word(),
            organisationsname: faker.lorem.word(),
            dataItemCount: 100,
            status: ImportStatus.STARTED,
            importByPersonId: faker.string.uuid(),
            rolleId: faker.string.uuid(),
            organisationId: faker.string.uuid(),
        };
        return Object.assign(Object.create(ImportVorgang.prototype) as ImportVorgang<boolean>, objectVallue, props);
    }

    public static createRollenerweiterung<WasPersisted extends boolean>(
        this: void,
        withId: WasPersisted,
        props?: Partial<Rollenerweiterung<WasPersisted>>,
    ): Rollenerweiterung<WasPersisted> {
        const rollenerweiterung: Partial<Rollenerweiterung<WasPersisted>> = {
            id: withId ? faker.string.uuid() : undefined,
            createdAt: withId ? faker.date.past() : undefined,
            updatedAt: withId ? faker.date.recent() : undefined,
            rolleId: faker.string.uuid(),
            serviceProviderId: faker.string.uuid(),
            organisationId: faker.string.uuid(),
        };
        return Object.assign(
            Object.create(Rollenerweiterung.prototype) as Rollenerweiterung<boolean>,
            rollenerweiterung,
            props,
        );
    }

    public static createEmailAddress<WasPersisted extends boolean>(
        withId: WasPersisted,
        address?: string,
        props?: Partial<EmailAddress<WasPersisted>>,
    ): EmailAddress<WasPersisted> {
        let emailAddress: EmailAddress<WasPersisted>;
        if (withId) {
            emailAddress = new EmailAddress(
                props?.id ?? faker.string.uuid(),
                props?.createdAt ?? faker.date.past(),
                props?.updatedAt ?? faker.date.recent(),
                props?.personId ?? faker.string.uuid(),
                address ?? faker.internet.email(),
                props?.status ?? faker.helpers.enumValue(EmailAddressStatus),
                props?.oxUserID ?? faker.string.uuid(),
            );
        } else {
            emailAddress = EmailAddress.createNew(
                props?.personId ?? faker.string.uuid(),
                address ?? faker.internet.email(),
                props?.status ?? faker.helpers.enumValue(EmailAddressStatus),
            ) as EmailAddress<WasPersisted>;
        }
        return emailAddress;
    }

    public static createEmailDomain<WasPersisted extends boolean>(
        withId: WasPersisted,
        props?: Partial<EmailDomain<WasPersisted>>,
    ): EmailDomain<WasPersisted> {
        return EmailDomain.construct({
            id: props?.id ?? (withId ? faker.string.uuid() : (undefined as unknown as string)),
            createdAt: props?.createdAt ?? faker.date.past(),
            updatedAt: props?.updatedAt ?? faker.date.recent(),
            domain: props?.domain ?? faker.internet.domainName(),
            spshServiceProviderId: props?.spshServiceProviderId ?? faker.string.uuid(),
        }) as EmailDomain<WasPersisted>;
    }

    public static createMicroserviceEmailAddress<WasPersisted extends boolean>(
        withId: WasPersisted,
        props?: Partial<MicroserviceEmailAddress<WasPersisted>>,
    ): MicroserviceEmailAddress<WasPersisted> {
        if (withId) {
            return MicroserviceEmailAddress.construct({
                id: props?.id ?? faker.string.uuid(),
                createdAt: props?.createdAt ?? faker.date.past(),
                updatedAt: props?.updatedAt ?? faker.date.recent(),
                address: props?.address ?? faker.internet.email(),
                priority: props?.priority ?? 0,
                spshPersonId: props?.spshPersonId ?? faker.string.uuid(),
                oxUserCounter: props?.oxUserCounter,
                externalId: props?.externalId ?? faker.string.uuid(),
                markedForCron: props?.markedForCron,
                sortedStatuses: props?.sortedStatuses ?? [{ status: EmailAddressStatusEnum.ACTIVE }],
            }) as MicroserviceEmailAddress<WasPersisted>;
        }
        return MicroserviceEmailAddress.createNew({
            address: props?.address ?? faker.internet.email(),
            priority: props?.priority ?? 0,
            spshPersonId: props?.spshPersonId ?? faker.string.uuid(),
            oxUserCounter: props?.oxUserCounter,
            externalId: props?.externalId ?? faker.string.uuid(),
            markedForCron: props?.markedForCron,
            sortedStatuses: props?.sortedStatuses ?? [{ status: EmailAddressStatusEnum.ACTIVE }],
        }) as MicroserviceEmailAddress<WasPersisted>;
    }
}
