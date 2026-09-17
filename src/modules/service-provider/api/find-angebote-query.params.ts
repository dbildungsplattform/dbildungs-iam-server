import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';
import { TransformToArray } from '../../../shared/util/array-transform.validator.js';
import { OrganisationID } from '../../../shared/types/index.js';
import { IsSystemrechtForRollenAdministration } from '../../rolle/api/is-systemrecht-for-rollen-admin-validator.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../rolle/domain/systemrecht.js';

export class FindAngeboteQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiProperty({
        description: 'The name for the angebot.',
        required: false,
    })
    public readonly searchStr?: string;

    @IsOptional()
    @IsUUID()
    @ApiProperty({
        description: 'The id of the organisation where the angebot should be available.',
        required: false,
    })
    public readonly organisationId?: OrganisationID;

    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        nullable: true,
        enumName: RollenSystemRechtEnumName,
        required: false,
        isArray: true,
        description:
            'The system right for which the roles should be available. Can only be ROLLEN_VERWALTEN, ROLLEN_ERWEITERN or both or IMPORT_DURCHFUEHREN.',
    })
    @IsSystemrechtForRollenAdministration()
    public readonly systemrechte?: RollenSystemRechtEnum[];
}
