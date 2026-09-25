import { IsInt, Min } from 'class-validator';

export class LdapRetryConfig {
    @Min(0)
    @IsInt()
    public readonly RETRY_WRAPPER_DEFAULT_RETRIES: number = 3;

    @Min(0)
    @IsInt()
    public readonly RETRY_WRAPPER_RETRY_DELAY_IN_MS: number = 15000;
}
