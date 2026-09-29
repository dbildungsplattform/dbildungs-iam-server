import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateOrganisationBodyParams {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @ApiPropertyOptional({ description: 'The new name of the organisation.' })
    public readonly name?: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @ApiPropertyOptional({ description: 'The new kennung of the organisation.' })
    public readonly kennung?: string;
}
