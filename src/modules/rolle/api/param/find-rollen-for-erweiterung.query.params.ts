import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';

import { OrganisationID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../domain/systemrecht.js';
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

    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @IsIn([RollenSystemRechtEnum.ROLLEN_ERWEITERN, RollenSystemRechtEnum.MPT_ROLLEN_VERWALTEN], { each: true })
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        nullable: true,
        enumName: RollenSystemRechtEnumName,
        required: false,
        isArray: true,
        description:
            'Widens the result to the roles the requesting user administers by virtue of these systemrechte.' +
            ' Can only be ROLLEN_ERWEITERN and optionally MPT_ROLLEN_VERWALTEN. Defaults to ROLLEN_ERWEITERN.',
    })
    public readonly systemrechte?: RollenSystemRechtEnum[];
}
