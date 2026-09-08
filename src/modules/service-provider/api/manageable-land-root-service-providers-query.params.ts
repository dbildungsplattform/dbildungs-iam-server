import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';

export class ManageableLandRootServiceProvidersQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @MaxLength(255)
    @ApiPropertyOptional({
        description: 'Filter service providers by name (case-insensitive substring match).',
        required: false,
    })
    public readonly searchStr?: string;
}
