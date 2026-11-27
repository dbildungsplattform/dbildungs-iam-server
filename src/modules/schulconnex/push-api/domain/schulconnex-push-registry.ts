import type { ServiceProviderID } from '../../../../shared/types/aggregate-ids.types.js';

export class SchulconnexPushRegistry<WasPersisted extends boolean> {
    private constructor(
        public id: Persisted<string, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public serviceProviderId: ServiceProviderID,
        public baseUrl: string,
        public oidcTokenEndpoint: Option<string>,
        public oidcClientId: Option<string>,
        public oidcClientSecretRef: Option<string>,
    ) {}

    public static construct(
        id: string,
        createdAt: Date,
        updatedAt: Date,
        serviceProviderId: ServiceProviderID,
        baseUrl: string,
        oidcTokenEndpoint: Option<string>,
        oidcClientId: Option<string>,
        oidcClientSecretRef: Option<string>,
    ): SchulconnexPushRegistry<true> {
        return new SchulconnexPushRegistry(
            id,
            createdAt,
            updatedAt,
            serviceProviderId,
            baseUrl,
            oidcTokenEndpoint,
            oidcClientId,
            oidcClientSecretRef,
        );
    }

    public static createNew(
        serviceProviderId: ServiceProviderID,
        baseUrl: string,
        oidcTokenEndpoint: string,
        oidcClientId: string,
        oidcClientSecretRef: string,
    ): SchulconnexPushRegistry<false> {
        return new SchulconnexPushRegistry(
            undefined,
            undefined,
            undefined,
            serviceProviderId,
            baseUrl,
            oidcTokenEndpoint,
            oidcClientId,
            oidcClientSecretRef,
        );
    }
}
