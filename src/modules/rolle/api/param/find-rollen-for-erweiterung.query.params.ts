import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { PagedQueryParams } from '../../../../shared/paging/index.js';
import { OrganisationID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenArt, RollenArtTypName } from '../../domain/rolle.enums.js';

export class FindRollenForErweiterungQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiProperty({
        description: 'The name for the role.',
        required: false,
    })
    public readonly searchStr?: string;

    @IsOptional()
    @IsUUID()
    @ApiProperty({
        description:
            'The organisation the Rollenerweiterung is performed for.' +
            ' If omitted, roles of all organisations the user may create Rollenerweiterungen for are returned.',
        required: false,
    })
    public readonly organisationId?: OrganisationID;

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
