import { ApiProperty } from '@nestjs/swagger';
import { PagedQueryParams } from '../../../shared/paging/index.js';
import { OrganisationID, RolleID } from '../../../shared/types/aggregate-ids.types.js';
import { RollenArt, RollenArtTypName } from '../domain/rolle.enums.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../domain/systemrecht.js';
import { ArrayUnique, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { TransformToArray } from '../../../shared/util/array-transform.validator.js';

export class FindAvailableRollenForPKCreationQueryParams extends PagedQueryParams {
    @IsUUID()
    @ApiProperty({
        description: 'The organisationId for which the available rollen should be found',
        required: true,
        nullable: false,
    })
    public readonly organisationId!: OrganisationID;

    @IsEnum(RollenArt)
    @IsOptional()
    @ApiProperty({
        enum: RollenArt,
        enumName: RollenArtTypName,
        description: 'The rollenart of the user for which the available rollen should be found',
        required: false,
        nullable: true,
    })
    public readonly rollenartOfUser?: RollenArt;

    @IsString()
    @IsOptional()
    @ApiProperty({
        description: 'The rolleName for which the available rollen should be found',
        required: false,
        nullable: true,
    })
    public readonly rolleName?: string;

    @TransformToArray()
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    @IsOptional()
    @TransformToArray()
    @ApiProperty({
        description: 'The rollenIds for which the available rollen should be found',
        required: false,
        nullable: true,
        type: [String],
    })
    public readonly rollenIds?: Array<RolleID>;

    @IsEnum(RollenSystemRechtEnum)
    @IsOptional()
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        enumName: RollenSystemRechtEnumName,
        description: 'The systemrecht for which the available rollen should be found',
        required: false,
        nullable: true,
    })
    public readonly systemrecht?: RollenSystemRechtEnum;
}
