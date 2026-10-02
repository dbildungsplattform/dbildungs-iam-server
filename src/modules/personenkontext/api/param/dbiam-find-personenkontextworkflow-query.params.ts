import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { PersonID } from '../../../../shared/types/aggregate-ids.types.js';
import { TransformToArray } from '../../../../shared/util/array-transform.validator.js';
import { OperationContext } from '../../domain/personenkontext.enums.js';

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
        description: 'ID of the person to be modified',
        required: false,
        nullable: true,
    })
    public readonly personId?: PersonID;

    @IsUUID()
    @IsOptional()
    @ApiProperty({
        description: 'ID of the organisation where the Personenkontexte should be created',
        required: false,
        nullable: true,
    })
    public readonly organisationId?: string;

    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    @IsOptional()
    @TransformToArray()
    @ApiProperty({
        description: 'IDs of the selected rollen.',
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
        description: 'The limit for the returned organisations.',
        required: false,
        nullable: false,
    })
    public readonly limit?: number;
}
