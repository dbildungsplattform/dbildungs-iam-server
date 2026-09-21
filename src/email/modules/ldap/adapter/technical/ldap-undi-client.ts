import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'ldapts';
import { LdapUndiEmailMicroserviceInstanceConfig } from './ldap-undi-email-microservice-instance-config.js';

@Injectable()
export class LdapUndiClient implements OnModuleDestroy {
    private client: Client | undefined;

    public constructor(private readonly ldapInstanceConfig: LdapUndiEmailMicroserviceInstanceConfig) {}

    public getClient(): Client {
        if (!this.client) {
            // configure LDAP connection
            const client: Client = new Client({
                url: this.ldapInstanceConfig.URL,
                timeout: 10000,
            });
            this.client = client;
        }
        return this.client;
    }

    public async disconnect(): Promise<boolean> {
        if (this.client) {
            await this.client.unbind();
            this.client = undefined;
            return true;
        } else {
            return false;
        }
    }

    public async onModuleDestroy(): Promise<void> {
        await this.disconnect();
    }
}
