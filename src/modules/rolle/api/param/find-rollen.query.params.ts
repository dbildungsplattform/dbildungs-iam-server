import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { ServiceProviderID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenArt, RollenArtTypName, RollenMerkmal, RollenMerkmalTypName } from '../../domain/rolle.enums.js';
import { FindRollenWithIdsQueryParams } from './find-rollen-with-ids.query.params.js';

export class FindRollenQueryParams extends FindRollenWithIdsQueryParams {
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

    @IsOptional()
    @IsEnum(RollenMerkmal, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ArrayMaxSize(Object.values(RollenMerkmal).length)
    @ApiProperty({
        enum: RollenMerkmal,
        enumName: RollenMerkmalTypName,
        isArray: true,
        required: false,
        maxItems: Object.values(RollenMerkmal).length,
        description: 'Filter roles by merkmal.',
    })
    public readonly merkmale?: RollenMerkmal[];

    @IsOptional()
    @IsUUID(undefined, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ApiProperty({
        description: 'Filter roles by service provider ids.',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly serviceProviderIds?: ServiceProviderID[];
}
