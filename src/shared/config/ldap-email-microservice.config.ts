import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class LdapEmailMicroserviceConfig {
    @IsBoolean()
    @IsNotEmpty()
    public readonly ENABLED!: boolean;

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

    @Min(0)
    @IsInt()
    public readonly RETRY_WRAPPER_NUMBER_OF_RETRIES!: number;

    @Min(0)
    @IsInt()
    public readonly RETRY_WRAPPER_DELAY_IN_MS!: number;
}
