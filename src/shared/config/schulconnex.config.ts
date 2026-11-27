import { IsInt, IsPositive, Min } from 'class-validator';

export class SchulconnexConfig {
    @Min(0)
    @IsInt()
    public readonly LIMIT_PERSONENINFO!: number;

    @IsInt()
    @IsPositive()
    public readonly PUSH_MAX_ATTEMPTS!: number;

    @IsInt()
    @IsPositive()
    public readonly PUSH_RETRY_DELAY_MS!: number;

    @IsInt()
    @IsPositive()
    public readonly PUSH_REQUEST_TIMEOUT_MS!: number;

    /** Applied per registry (external system) and per pod */
    @IsInt()
    @IsPositive()
    public readonly PUSH_MAX_REQUESTS_PER_SECOND!: number;

    /** Number of persons loaded at once when a Rollenerweiterung event affects many persons */
    @IsInt()
    @IsPositive()
    public readonly PUSH_MAX_BATCH_SIZE!: number;
}
