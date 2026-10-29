import type { ServiceProviderID } from '../../../../shared/types/aggregate-ids.types.js';

export class SchulconnexPushRegistry<WasPersisted extends boolean> {
    private constructor(
        public id: Persisted<string, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public serviceProviderId: ServiceProviderID,
        public baseUrl: string,
    ) {}

    public static construct(
        id: string,
        createdAt: Date,
        updatedAt: Date,
        serviceProviderId: ServiceProviderID,
        baseUrl: string,
    ): SchulconnexPushRegistry<true> {
        return new SchulconnexPushRegistry(id, createdAt, updatedAt, serviceProviderId, baseUrl);
    }

    public static createNew(serviceProviderId: ServiceProviderID, baseUrl: string): SchulconnexPushRegistry<false> {
        return new SchulconnexPushRegistry(undefined, undefined, undefined, serviceProviderId, baseUrl);
    }
}
