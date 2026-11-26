import { faker } from '@faker-js/faker';
import type { PersonDataUndi } from '../modules/ldap/adapter/domain/ldap-undi-client.adapter.js';

export function createPersonDataUndi(props?: Partial<PersonDataUndi>): PersonDataUndi {
    return {
        domain: props?.domain ?? faker.internet.domainName(),
        uid: props?.uid ?? faker.string.uuid(),
        firstName: props?.firstName ?? faker.person.firstName(),
        lastName: props?.lastName ?? faker.person.lastName(),
        username: props?.username ?? faker.internet.username(),
        mailPrimaryAddress: props?.mailPrimaryAddress ?? faker.internet.email(),
        mailSecondaryAddress: props?.mailSecondaryAddress,
        deaktiviert: props?.deaktiviert ?? false,
        gesperrt: props?.gesperrt ?? false,
    };
}
