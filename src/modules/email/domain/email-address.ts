import { type PersonID } from '../../../shared/types/index.js';

export const EmailAddressStatusName: string = 'EmailAddressStatus';

export enum EmailAddressStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
    REQUESTED = 'REQUESTED',
    FAILED = 'FAILED',
    DELETED_LDAP = 'DELETED_LDAP',
    DELETED_OX = 'DELETED_OX',
    DELETED = 'DELETED',
}

export class EmailAddress<WasPersisted extends boolean> {
    public constructor(
        public id: Persisted<string, WasPersisted>,
        public readonly createdAt: Persisted<Date, WasPersisted>,
        public readonly updatedAt: Persisted<Date, WasPersisted>,
        private readonly addressPersonId: PersonID | undefined,
        private addressAddress: string,
        private addressStatus: EmailAddressStatus,
        private oxUserId?: string,
    ) {}

    public static construct(
        id: string,
        createdAt: Date,
        updatedAt: Date,
        personId: PersonID | undefined,
        address: string,
        status: EmailAddressStatus,
        oxUserId?: string,
    ): EmailAddress<true> {
        return new EmailAddress(id, createdAt, updatedAt, personId, address, status, oxUserId);
    }

    public static createNew(
        personId: PersonID | undefined,
        address: string,
        status: EmailAddressStatus,
        oxUserId?: string,
    ): EmailAddress<false> {
        return new EmailAddress(undefined, undefined, undefined, personId, address, status, oxUserId);
    }

    public enable(): boolean {
        const oldValue: boolean = this.enabled;
        this.addressStatus = EmailAddressStatus.ENABLED;

        return oldValue;
    }

    public request(): boolean {
        const oldValue: boolean = this.enabled;
        this.addressStatus = EmailAddressStatus.REQUESTED;

        return oldValue;
    }

    public disable(): boolean {
        const oldValue: boolean = this.enabled;
        this.addressStatus = EmailAddressStatus.DISABLED;

        return oldValue;
    }

    public failed(): boolean {
        const oldValue: boolean = this.enabled;
        this.addressStatus = EmailAddressStatus.FAILED;

        return oldValue;
    }

    /**
     * Sets the status to DELETED_FROM_LDAP, unless status is already DELETED_OX, then the resulting status is DELETED.
     * Returns the resulting status.
     */
    public deletedFromLdap(): EmailAddressStatus {
        const oldStatus: EmailAddressStatus = this.addressStatus;
        if (oldStatus === EmailAddressStatus.DELETED_OX) {
            this.addressStatus = EmailAddressStatus.DELETED;
        } else {
            this.addressStatus = EmailAddressStatus.DELETED_LDAP;
        }

        return this.addressStatus;
    }

    /**
     * Sets the status to DELETED_OX, unless status is already DELETED_LDAP, then the resulting status is DELETED.
     * Returns the resulting status.
     */
    public deletedFromOx(): EmailAddressStatus {
        const oldStatus: EmailAddressStatus = this.addressStatus;
        if (oldStatus === EmailAddressStatus.DELETED_LDAP) {
            this.addressStatus = EmailAddressStatus.DELETED;
        } else {
            this.addressStatus = EmailAddressStatus.DELETED_OX;
        }

        return this.addressStatus;
    }

    public get enabled(): boolean {
        return this.addressStatus === EmailAddressStatus.ENABLED;
    }

    public get status(): EmailAddressStatus {
        return this.addressStatus;
    }

    public get enabledOrRequested(): boolean {
        return this.addressStatus === EmailAddressStatus.ENABLED || this.addressStatus === EmailAddressStatus.REQUESTED;
    }

    public get personId(): PersonID | undefined {
        return this.addressPersonId;
    }

    public get address(): string {
        return this.addressAddress;
    }

    public setAddress(address: string): string {
        this.addressAddress = address;
        return this.addressAddress;
    }

    public get currentAddress(): Option<string> {
        if (!this.enabled) {
            return undefined;
        }

        return this.addressAddress;
    }

    public get oxUserID(): Option<string> {
        return this.oxUserId;
    }

    public set oxUserID(oxUserId: string) {
        this.oxUserId = oxUserId;
    }
}
