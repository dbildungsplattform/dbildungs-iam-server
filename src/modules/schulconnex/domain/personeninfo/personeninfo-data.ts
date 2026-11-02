import { type EmailAddress } from '../../../email/domain/email-address.js';
import { type UserLock } from '../../../keycloak-administration/domain/user-lock.js';
import { type Person } from '../../../person/domain/person.js';
import { type KontextWithOrgaAndRolle } from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';

export interface PersonenInfoData {
    readonly person: Person<true>;
    readonly kontexteWithOrgaAndRolle: KontextWithOrgaAndRolle[];
    readonly email: Option<Pick<EmailAddress<true>, 'address' | 'status'>>;
    readonly userLocks: UserLock[];
}
