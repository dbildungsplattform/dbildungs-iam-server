import { IsInt, IsString, Max, Min } from 'class-validator';

export class VidisConfig {
    @IsString()
    public readonly BASE_URL!: string;

    @IsString()
    public readonly CLIENT_ID!: string;

    @IsString()
    public readonly KEYCLOAK_CLIENT_ID!: string;

    @IsString()
    public readonly CLIENT_SECRET!: string;

    @IsInt()
    @Min(1)
    @Max(10000)
    public readonly SYNC_SCHOOLS_PAGE_SIZE!: number;

    @IsString()
    public readonly REGION!: string;
}
