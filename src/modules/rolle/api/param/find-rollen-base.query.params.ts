import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PagedQueryParams } from '../../../../shared/paging/index.js';

export abstract class FindRollenBaseQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiProperty({
        description: 'The name for the role.',
        required: false,
    })
    public readonly searchStr?: string;
}
