import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class RedisSentinelNodeConfig {
    @IsString()
    @IsNotEmpty()
    public readonly HOST!: string;

    @IsInt()
    @Min(1)
    @Max(65535)
    public readonly PORT!: number;
}
