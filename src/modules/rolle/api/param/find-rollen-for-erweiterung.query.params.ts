import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

import { OrganisationID } from '../../../../shared/types/index.js';
import { FindRollenForWorkflowQueryParams } from './find-rollen-for-workflow.query.params.js';

export class FindRollenForErweiterungQueryParams extends FindRollenForWorkflowQueryParams {
    @IsOptional()
    @IsUUID()
    @ApiProperty({
        description:
            'The organisation the Rollenerweiterung is performed for.' +
            ' If omitted, roles of all organisations the user may create Rollenerweiterungen for are returned.',
        required: false,
    })
    public readonly organisationId?: OrganisationID;
}
