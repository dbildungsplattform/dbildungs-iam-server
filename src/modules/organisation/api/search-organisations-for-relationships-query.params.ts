import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';

export class SearchOrganisationsForRelationshipsQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiPropertyOptional({
        description: 'Search string used to filter eligible organisations by name or Kennung.',
    })
    public readonly searchString?: string;
}
