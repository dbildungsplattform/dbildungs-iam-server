import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { OrganisationID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../domain/systemrecht.js';
import { FindRollenForWorkflowQueryParams } from './find-rollen-for-workflow.query.params.js';
import { IsSystemrechtAndGatedSystemrechte } from './is-systemrecht-and-gated-systemrechte.decorator.js';

export class FindRollenForErweiterungQueryParams extends FindRollenForWorkflowQueryParams {
    @IsUUID()
    @ApiProperty({
        description: 'The organisation the Rollenerweiterung is performed for.',
        required: true,
    })
    public readonly organisationId!: OrganisationID;

    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @IsSystemrechtAndGatedSystemrechte(RollenSystemRechtEnum.ROLLEN_ERWEITERN)
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        nullable: true,
        enumName: RollenSystemRechtEnumName,
        required: false,
        isArray: true,
        description:
            "Systemrechte the requesting user's permissions are evaluated against." +
            ' Including gated rights additionally returns roles carrying the paired gated Merkmale.' +
            ' Can only be ROLLEN_ERWEITERN and optionally any gated right. Defaults to ROLLEN_ERWEITERN.',
    })
    public readonly systemrechte?: RollenSystemRechtEnum[];
}
