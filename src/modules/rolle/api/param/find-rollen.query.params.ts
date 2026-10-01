import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';

import { ServiceProviderID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenArt, RollenArtTypName, RollenMerkmal, RollenMerkmalTypName } from '../../domain/rolle.enums.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../domain/systemrecht.js';
import { FindRollenWithIdsQueryParams } from './find-rollen-with-ids.query.params.js';

export class FindRollenQueryParams extends FindRollenWithIdsQueryParams {
    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @IsIn(
        [
            RollenSystemRechtEnum.ROLLEN_VERWALTEN,
            RollenSystemRechtEnum.ROLLEN_ERWEITERN,
            RollenSystemRechtEnum.MPT_ROLLEN_ZUORDNEN,
        ],
        { each: true },
    )
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        nullable: true,
        enumName: RollenSystemRechtEnumName,
        required: false,
        isArray: true,
        description: `Restricts the result to roles administered at organisations where the requesting user holds the given systemrechte. Must be ${RollenSystemRechtEnum.ROLLEN_VERWALTEN}, ${RollenSystemRechtEnum.ROLLEN_ERWEITERN}, or ${RollenSystemRechtEnum.MPT_ROLLEN_ZUORDNEN}. Defaults to ${RollenSystemRechtEnum.ROLLEN_VERWALTEN}.`,
    })
    public readonly systemrechte?: RollenSystemRechtEnum[];

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
