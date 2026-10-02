import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsEnum, IsOptional } from 'class-validator';

import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenArt, RollenArtTypName } from '../../domain/rolle.enums.js';
import { FindRollenBaseQueryParams } from './find-rollen-base.query.params.js';

export abstract class FindRollenForWorkflowQueryParams extends FindRollenBaseQueryParams {
    @IsOptional()
    @IsEnum(RollenArt, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ArrayMaxSize(Object.values(RollenArt).length)
    @ApiProperty({
        enum: RollenArt,
        enumName: RollenArtTypName,
        isArray: true,
        uniqueItems: true,
        required: false,
        maxItems: Object.values(RollenArt).length,
        description: 'Filter roles by rollenart.',
    })
    public readonly rollenarten?: RollenArt[];
}
