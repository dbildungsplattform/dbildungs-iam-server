import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class LdapServerConfig {
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
    @IsNotEmpty()
    public readonly BASE_DN!: string;

    @Min(0)
    @IsInt()
    public readonly RETRY_WRAPPER_NUMBER_OF_RETRIES!: number;

    @Min(0)
    @IsInt()
    public readonly RETRY_WRAPPER_DELAY_IN_MS!: number;
}
