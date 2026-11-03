import { Opt } from '@mikro-orm/core';
import { Entity, Enum, Property } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';

export enum MeldungStatus {
    VEROEFFENTLICHT = 'VEROEFFENTLICHT',
    NICHT_VEROEFFENTLICHT = 'NICHT_VEROEFFENTLICHT',
}

@Entity({ tableName: 'meldung' })
export class MeldungEntity extends TimestampedEntity {
    public constructor() {
        super();
    }

    @Property({ type: 'text' })
    public inhalt!: string;

    @Enum({
        items: () => MeldungStatus,
        default: MeldungStatus.NICHT_VEROEFFENTLICHT,
        nativeEnumName: 'meldung_status_enum',
    })
    public status!: MeldungStatus & Opt;

    @Property({ default: 1 })
    public revision!: number & Opt;
}
