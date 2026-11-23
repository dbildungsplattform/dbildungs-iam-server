import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsOptional, IsUUID } from 'class-validator';

import { OrganisationID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { FindRollenBaseQueryParams } from './find-rollen-base.query.params.js';

export abstract class FindRollenWithOrganisationFilterQueryParams extends FindRollenBaseQueryParams {
    @IsOptional()
    @IsUUID(undefined, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ApiProperty({
        description: 'Filters the result to Rollen administered by any of the given organisations.',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly organisationIds?: OrganisationID[];
}
