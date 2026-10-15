import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { OrganisationID } from '../../../../shared/types/index.js';
import { FindRollenForWorkflowQueryParams } from './find-rollen-for-workflow.query.params.js';

export class FindRollenForImportQueryParams extends FindRollenForWorkflowQueryParams {
    @IsUUID()
    @ApiProperty({
        description: 'The organisation the import is performed for.',
        required: true,
        nullable: false,
    })
    public readonly organisationId!: OrganisationID;
}
