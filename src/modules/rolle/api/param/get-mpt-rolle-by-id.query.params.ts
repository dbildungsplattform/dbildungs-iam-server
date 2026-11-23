import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { OrganisationID } from '../../../../shared/types/index.js';

export class GetMptRolleByIdQueryParams {
    @IsUUID()
    @IsOptional()
    @ApiProperty({
        description: 'Restricts the rolle to the given organisation and its children.',
        required: false,
        nullable: true,
    })
    public readonly organisationId?: OrganisationID;
}
