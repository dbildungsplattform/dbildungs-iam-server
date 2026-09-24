import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LdapRetryConfig } from './ldap-retry.config.js';

export class LdapServerConfig extends LdapRetryConfig {
    @IsString()
    @IsNotEmpty()
    public readonly URL!: string;

    @IsString()
    @IsNotEmpty()
    public readonly BIND_DN!: string;

    @IsString()
    @IsNotEmpty()
    public readonly ADMIN_PASSWORD!: string;

    @IsString()
    @IsOptional()
    public readonly OEFFENTLICHE_SCHULEN_DOMAIN?: string;

    @IsString()
    @IsOptional()
    public readonly ERSATZSCHULEN_DOMAIN?: string;

    @IsString()
    @IsNotEmpty()
    public readonly BASE_DN!: string;
}
