import { ArrayUnique, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../../rolle/domain/systemrecht.js';
import { OperationContext } from '../../domain/personenkontext.enums.js';
import { PersonID } from '../../../../shared/types/aggregate-ids.types.js';

export class FindDbiamPersonenkontextWorkflowQueryParams {
    @IsEnum(OperationContext)
    @ApiProperty({
        enum: OperationContext,
        enumName: 'OperationContext',
        description: 'The context in which this request happens. Affects permission checks.',
        required: true,
    })
    public readonly operationContext!: OperationContext;

    @IsUUID()
    @IsOptional()
    @ApiProperty({
        description: 'ID of the person to be modified, will restrict the returned roles',
        required: false,
        nullable: true,
    })
    public readonly personId?: PersonID;

    @IsUUID()
    @IsOptional()
    @ApiProperty({
        description: 'ID of the organisation to filter the rollen later',
        required: false,
        nullable: true,
    })
    public readonly organisationId?: string;

    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    @IsOptional()
    @TransformToArray()
    @ApiProperty({
        description: 'IDs of the rollen.',
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly rollenIds?: string[];

    @IsString()
    @IsOptional()
    @ApiProperty({
        description: 'Organisation/SSK name used to filter for schulstrukturknoten in personenkontext.',
        required: false,
        nullable: true,
    })
    public readonly organisationName?: string;

    @IsNotEmpty()
    @IsNumber()
    @IsOptional()
    @ApiProperty({
        description: 'The limit of items for the request.',
        required: false,
        nullable: false,
    })
    public readonly limit?: number;

    @IsEnum(RollenSystemRechtEnum)
    @IsOptional()
    @ApiProperty({
        enum: RollenSystemRechtEnum,
        enumName: RollenSystemRechtEnumName,
        description: 'The systemrecht used to filter for rollen in personenkontext.',
        required: false,
        nullable: true,
    })
    public readonly requestedWithSystemrecht?: RollenSystemRechtEnum;
}
