import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { PagedQueryParams } from '../../../../shared/paging/index.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenArt, RollenArtTypName, RollenMerkmal, RollenMerkmalTypName } from '../../domain/rolle.enums.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../domain/systemrecht.js';

export class FindRollenQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiProperty({
        description: 'The name for the role.',
        required: false,
    })
    public readonly searchStr?: string;

    @IsOptional()
    @IsUUID(undefined, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ApiProperty({
        description: 'Filters the result to roles administered by any of the given organisations.',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly organisationenForFilter?: OrganisationID[];

    @IsOptional()
    @IsUUID(undefined, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ApiProperty({
        description:
            'The ids of the selected Rollen. If provided, these Rollen will be returned regardless of the other filters since they are required by the frontend',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly rolleIds?: RolleID[];

    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        nullable: true,
        enumName: RollenSystemRechtEnumName,
        required: false,
        isArray: true,
        description:
            'Restricts the result to roles administered at organisations where the requesting user holds the given systemrechte.' +
            ' Defaults to ROLLEN_VERWALTEN.',
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
