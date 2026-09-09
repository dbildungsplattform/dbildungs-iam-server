import { IsUUID } from 'class-validator';
import { OrganisationID } from '../../../shared/types/index.js';
import { ApiProperty } from '@nestjs/swagger';

export class FindRollenerweiterungQueryParams {
    @IsUUID()
    @ApiProperty({
        description: 'The id of the organisation where the role should be available.',
        required: true,
    })
    public readonly organisationId!: OrganisationID;
}
