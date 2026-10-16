/* v8 ignore file -- @preserve */
// type definitions only can not be covered by v8
import { type PersonID, type PersonUsername } from '../../shared/types/aggregate-ids.types.js';
import { type OXUserID, type OXUserName } from '../../shared/types/ox-ids.types.js';
import { type Person } from '../../modules/person/domain/person.js';

export type PersonIdentifier = {
    personId: PersonID | undefined;
    username: PersonUsername | undefined;
};

export type PersonEmailIdentifier = {
    personId: PersonID;
    username: PersonUsername;
    oxUserId: OXUserID;
    oxUserName: OXUserName;
    person: Person<true>;
};
