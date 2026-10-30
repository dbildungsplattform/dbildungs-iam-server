import { IsNumber } from 'class-validator';

export class EventOutboxConfig {
    @IsNumber()
    public readonly POLL_INTERVAL_MS!: number;

    @IsNumber()
    public readonly BATCH_SIZE!: number;
}
