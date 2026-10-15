import { type OXEmail, type OXUserName } from '../../../shared/types/ox-ids.types.js';

export class OxUserBlacklistEntry<WasPersisted extends boolean> {
    public constructor(
        public id: Persisted<string, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public email: OXEmail,
        public name: string,
        public username: OXUserName,
    ) {}

    public static construct(
        id: string,
        createdAt: Date,
        updatedAt: Date,
        email: OXEmail,
        name: string,
        username: OXUserName,
    ): OxUserBlacklistEntry<true> {
        return new OxUserBlacklistEntry(id, createdAt, updatedAt, email, name, username);
    }

    public static createNew(email: OXEmail, name: string, username: OXUserName): OxUserBlacklistEntry<false> {
        return new OxUserBlacklistEntry(undefined, undefined, undefined, email, name, username);
    }
}
