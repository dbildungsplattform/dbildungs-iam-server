import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UserExternalDataV2BodyParams {
    @IsString()
    @ApiProperty({ required: true })
    public sub!: string;

    @IsString()
    @ApiProperty({ required: true, description: 'Unique identifier of the Angebot to check the permission for.' })
    public keycloakClient!: string;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ default: false })
    public includeEmailAddress?: boolean;
}
