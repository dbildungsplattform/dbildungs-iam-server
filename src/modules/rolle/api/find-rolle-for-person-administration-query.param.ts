import { ApiProperty } from '@nestjs/swagger';
import { ArrayContains, ArrayUnique, IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { TransformToArray } from '../../../shared/util/array-transform.validator.js';
import { RollenmerkmalSystemrechtPaar } from '../domain/rollenmerkmal-systemrecht-paar.js';
import { RollenSystemRecht, RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../domain/systemrecht.js';
import { PagedQueryParams } from '../../../shared/paging/paged.query.params.js';

const ALLOWED_SYSTEMRECHTE: RollenSystemRechtEnum[] = [
    RollenSystemRechtEnum.PERSONEN_VERWALTEN,
    ...RollenmerkmalSystemrechtPaar.GATED_SYSTEMRECHTE.map((systemrecht: RollenSystemRecht) => systemrecht.name),
];

export class FindRolleForPersonAdministrationQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiProperty({
        description: 'The name for the role.',
        required: false,
    })
    public readonly searchStr?: string;

    @IsOptional()
    @IsArray()
    @IsUUID('all', { each: true })
    @TransformToArray<string>()
    @ApiProperty({
        description: 'OrganisationIds to filter rollen.',
        required: false,
        isArray: true,
    })
    public readonly organisationIds?: string[];

    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @ArrayContains([RollenSystemRechtEnum.PERSONEN_VERWALTEN])
    @IsIn(ALLOWED_SYSTEMRECHTE, {
        each: true,
    })
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        nullable: true,
        enumName: RollenSystemRechtEnumName,
        required: false,
        isArray: true,
        description:
            'The system right for which the roles should be available. Can only be PERSONEN_VERWALTEN and optionally any gated Systemrecht (e.g. MPT_ROLLEN_ZUORDNEN, PILOT_1_ROLLEN_ZUORDNEN, ...).',
    })
    public readonly systemrechte?: RollenSystemRechtEnum[];
}
