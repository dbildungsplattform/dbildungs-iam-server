import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

import { PagedQueryParams } from '../../../shared/paging/index.js';
import { OrganisationID, RolleID, ServiceProviderID } from '../../../shared/types/index.js';
import { TransformToArray } from '../../../shared/util/array-transform.validator.js';
import { RollenArt, RollenArtTypName, RollenMerkmal, RollenMerkmalTypName } from '../domain/rolle.enums.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../domain/systemrecht.js';
import { IsNotAllowedWithOperationRecht } from './is-not-allowed-with-operation-recht.validator.js';
import { IsOnlyAllowedWithOperationRecht } from './is-only-allowed-with-workflow-recht.validator.js';
import { IsSystemrechtForRollenAdministration } from './is-systemrecht-for-rollen-admin-validator.js';

export class FindRollenQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiProperty({
        description: 'The name for the role.',
        required: false,
    })
    public readonly searchStr?: string;

    @IsOptional()
    @IsUUID()
    @IsOnlyAllowedWithOperationRecht()
    @ApiProperty({
        description:
            'Only relevant when systemrechte contains ROLLEN_ERWEITERN or IMPORT_DURCHFUEHREN.' +
            ' Provides the organisation context for the requested workflow operation.' +
            ' If provided, only roles available for that organisation will be returned.' +
            ' Mutually exclusive with organisationenForFilter.',
        required: false,
    })
    public readonly organisationContextForOperation?: OrganisationID;

    @IsOptional()
    @IsUUID(undefined, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @IsNotAllowedWithOperationRecht()
    @ApiProperty({
        description:
            'Only relevant when systemrechte contains ROLLEN_VERWALTEN or no systemrechte is provided.' +
            ' Filters the result to roles administered by any of the given organisations.' +
            ' Mutually exclusive with organisationContextForOperation.',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly organisationenForFilter?: OrganisationID[];

    @IsOptional()
    @IsUUID(undefined, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ApiProperty({
        description:
            'The ids of the selected Rollen. If provided, these Rollen will be returned regardless of the other filters since they are required by the frontend',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly rolleIds?: RolleID[];

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
            'Determines the authorization context for this request.' +
            ' Use ROLLEN_VERWALTEN (default) with organisationIdsForFilter for general role administration.' +
            ' Use ROLLEN_ERWEITERN or IMPORT_DURCHFUEHREN with organisationIdContextForOperation for workflow-specific role lookups.' +
            ' Can only be ROLLEN_VERWALTEN, ROLLEN_ERWEITERN or both, or IMPORT_DURCHFUEHREN.',
    })
    @IsSystemrechtForRollenAdministration()
    public readonly systemrechte?: RollenSystemRechtEnum[];

    @IsOptional()
    @IsEnum(RollenArt, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ArrayMaxSize(Object.values(RollenArt).length)
    @ApiProperty({
        enum: RollenArt,
        enumName: RollenArtTypName,
        isArray: true,
        uniqueItems: true,
        required: false,
        maxItems: Object.values(RollenArt).length,
        description: 'Filter roles by rollenart.',
    })
    public readonly rollenarten?: RollenArt[];

    @IsOptional()
    @IsEnum(RollenMerkmal, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ArrayMaxSize(Object.values(RollenMerkmal).length)
    @ApiProperty({
        enum: RollenMerkmal,
        enumName: RollenMerkmalTypName,
        isArray: true,
        required: false,
        maxItems: Object.values(RollenMerkmal).length,
        description: 'Filter roles by merkmal.',
    })
    public readonly merkmale?: RollenMerkmal[];

    @IsOptional()
    @IsUUID(undefined, { each: true })
    @TransformToArray()
    @ArrayUnique()
    @ApiProperty({
        description: 'Filter roles by service provider ids.',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly serviceProviderIds?: ServiceProviderID[];
}
