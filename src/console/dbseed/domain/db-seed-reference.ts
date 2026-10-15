import { type ReferencedEntityType } from '../repo/db-seed-reference.entity.js';

export class DbSeedReference {
    private constructor(
        public referencedEntityType: ReferencedEntityType,
        public virtualId: number,
        public uuid: string,
    ) {}

    public static createNew(
        referencedEntityType: ReferencedEntityType,
        virtualId: number,
        uuid: string,
    ): DbSeedReference {
        return new DbSeedReference(referencedEntityType, virtualId, uuid);
    }
}
