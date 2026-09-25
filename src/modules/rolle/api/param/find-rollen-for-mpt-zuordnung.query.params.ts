import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsOptional, IsUUID } from 'class-validator';

import { OrganisationID, RolleID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { FindRollenBaseQueryParams } from './find-rollen-base.query.params.js';

export class FindRollenForMptZuordnungQueryParams extends FindRollenBaseQueryParams {
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
    public readonly organisationIds?: OrganisationID[];

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
