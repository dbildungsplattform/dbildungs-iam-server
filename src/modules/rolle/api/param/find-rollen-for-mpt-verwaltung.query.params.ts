import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsOptional, IsString, IsUUID } from 'class-validator';

import { PagedQueryParams } from '../../../../shared/paging/index.js';
import { OrganisationID, RolleID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';

export class FindRollenForMptVerwaltungQueryParams extends PagedQueryParams {
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
}
