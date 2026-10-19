import { type EmailAddressStatusEnum } from '../persistence/email-address-status.entity.js';

export type EmailAddressStatus = {
    id?: string;
    status: EmailAddressStatusEnum;
};

export class EmailAddress<WasPersisted extends boolean> {
    public constructor(
        public id: Persisted<string, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        public address: string,
        public priority: number,
        public spshPersonId: string,
        public oxUserCounter: string | undefined,
        public externalId: string,
        public markedForCron: Date | undefined,
        public sortedStatuses: EmailAddressStatus[],
    ) {}

    public static construct(params: {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        address: string;
        priority: number;
        spshPersonId: string;
        oxUserCounter: string | undefined;
        externalId: string;
        markedForCron?: Date;
        sortedStatuses: EmailAddressStatus[];
    }): EmailAddress<true> {
        return new EmailAddress(
            params.id,
            params.createdAt,
            params.updatedAt,
            params.address,
            params.priority,
            params.spshPersonId,
            params.oxUserCounter,
            params.externalId,
            params.markedForCron,
            params.sortedStatuses,
        );
    }

    public static createNew(params: {
        address: string;
        priority: number;
        spshPersonId: string;
        oxUserCounter: string | undefined;
        externalId: string;
        markedForCron?: Date;
        sortedStatuses?: EmailAddressStatus[];
    }): EmailAddress<false> {
        return new EmailAddress(
            undefined,
            undefined,
            undefined,
            params.address,
            params.priority,
            params.spshPersonId,
            params.oxUserCounter,
            params.externalId,
            params.markedForCron,
            params.sortedStatuses ?? [],
        );
    }

    public setStatus(status: EmailAddressStatusEnum): void {
        if (status !== this.getStatus()) {
            this.sortedStatuses.unshift({
                status,
            });
        }
    }

    public getStatus(): EmailAddressStatusEnum | undefined {
        return this.sortedStatuses[0]?.status;
    }

    public getDomain(): string | undefined {
        const atIndex: number = this.address.indexOf('@');
        if (atIndex === -1) {
            return undefined;
        }
        return this.address.substring(atIndex + 1);
    }
}
