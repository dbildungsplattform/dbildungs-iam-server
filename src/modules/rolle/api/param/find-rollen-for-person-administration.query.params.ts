import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrganisationID } from '../../../../shared/types/index.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../domain/systemrecht.js';
import { FindRollenBaseQueryParams } from './find-rollen-base.query.params.js';
import { IsSystemrechtAndGatedSystemrechte } from './is-systemrecht-and-gated-systemrechte.decorator.js';

export class FindRollenForPersonAdministrationQueryParams extends FindRollenBaseQueryParams {
    @IsOptional()
    @IsArray()
    @IsUUID('all', { each: true })
    @TransformToArray<string>()
    @ApiProperty({
        description: 'Filters the result to roles administered by any of the given organisations.',
        required: false,
        isArray: true,
    })
    public readonly organisationIds?: OrganisationID[];

    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @IsSystemrechtAndGatedSystemrechte(RollenSystemRechtEnum.PERSONEN_VERWALTEN)
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
