import { BlobType, Collection, quote, SchemaTable } from '@mikro-orm/core';
import { Check, Entity, Enum, Index, OneToMany, Property, Unique } from '@mikro-orm/decorators/legacy';
import { TimestampedEntity } from '../../../persistence/timestamped.entity.js';
import {
    ServiceProviderKategorie,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from '../domain/service-provider.enum.js';
import { ServiceProviderMerkmalEntity } from './service-provider-merkmal.entity.js';
import { ServiceProviderRollenartWhitelistEntity } from './service-provider-rollenart-whitelist.entity.js';

@Entity({ tableName: 'service_provider' })
@Check({
    name: 'logo_or_logo_id_consistency',
    expression: ({ logo, logoId }: Record<keyof ServiceProviderEntity, string>) =>
        quote`(${logoId} IS NULL AND ${logo} IS NULL) OR (${logoId} IS NULL AND ${logo} IS NOT NULL) OR (${logoId} IS NOT NULL AND ${logo} IS NULL)`,
})
@Unique({
    name: 'service_provider_schulstrukturknoten_vidis_angebot_id_unique',
    properties: ['providedOnSchulstrukturknoten', 'vidisAngebotId'],
})
export class ServiceProviderEntity extends TimestampedEntity {
    @Index({
        name: 'service_provider_name_trgm_index',
        expression: (columns: Record<keyof ServiceProviderEntity, string>, table: SchemaTable, name: string) =>
            quote`create index ${name} on ${table} using gin (${columns.name} gin_trgm_ops);`,
    })
    @Property()
    public name!: string;

    @Enum({ items: () => ServiceProviderTarget, nativeEnumName: 'service_provider_target_enum' })
    public target!: ServiceProviderTarget;

    @Property({ nullable: true, type: 'text' })
    public url?: string;

    @Property({ columnType: 'uuid' })
    public providedOnSchulstrukturknoten!: string;

    @Enum({
        items: () => ServiceProviderKategorie,
        nativeEnumName: 'service_provider_kategorie_enum',
        customOrder: [
            ServiceProviderKategorie.EMAIL,
            ServiceProviderKategorie.UNTERRICHT,
            ServiceProviderKategorie.VERWALTUNG,
            ServiceProviderKategorie.SCHULISCH,
            ServiceProviderKategorie.HINWEISE,
        ],
    })
    public kategorie!: ServiceProviderKategorie;

    @Property({ nullable: true, unsigned: true, columnType: 'int' })
    public logoId?: number;

    @Property({ type: BlobType, nullable: true })
    public logo?: Buffer;

    @Property({ nullable: true })
    public logoMimeType?: string;

    @Property({ nullable: true })
    public keycloakGroup?: string;

    @Property({ nullable: true })
    public keycloakRole?: string;

    @Enum({ items: () => ServiceProviderSystem, nativeEnumName: 'service_provider_system_enum' })
    public externalSystem!: ServiceProviderSystem;

    @Property()
    public requires2fa!: boolean;

    @Property({ nullable: true })
    public vidisAngebotId?: string;

    @Property({ nullable: true })
    public keycloakClient?: string;

    @OneToMany({
        entity: () => ServiceProviderMerkmalEntity,
        mappedBy: 'serviceProvider',
        orphanRemoval: true,
        eager: true,
    })
    public merkmale: Collection<ServiceProviderMerkmalEntity> = new Collection<ServiceProviderMerkmalEntity>(this);

    @OneToMany({
        entity: () => ServiceProviderRollenartWhitelistEntity,
        mappedBy: 'serviceProvider',
        orphanRemoval: true,
        eager: true,
    })
    public rollenartenWhitelist: Collection<ServiceProviderRollenartWhitelistEntity> =
        new Collection<ServiceProviderRollenartWhitelistEntity>(this);
}
