import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { DbiamPersonenkontextBodyParams } from './dbiam-personenkontext.body.params.js';
import { OperationContext } from '../../domain/personenkontext.enums.js';

export class DbiamUpdatePersonenkontexteBodyParams {
    @IsDate()
    @IsOptional()
    @ApiProperty({
        required: false,
        nullable: true,
        description: 'Date of the most recent changed personenkontext',
    })
    public readonly lastModified?: Date;

    @IsNumber()
    @ApiProperty({
        required: true,
        nullable: false,
        description: 'The amount of personenkontexte',
    })
    public readonly count!: number;

    @ApiProperty({ type: [DbiamPersonenkontextBodyParams], required: true, nullable: false })
    @Type(() => DbiamPersonenkontextBodyParams)
    @ValidateNested({ each: true })
    public readonly personenkontexte!: DbiamPersonenkontextBodyParams[];

    @IsEnum(OperationContext)
    @ApiProperty({
        enum: OperationContext,
        enumName: 'OperationContext',
        description: 'The context in which this request happens. Affects permission checks.',
        required: true,
    })
    public readonly operationContext!: OperationContext;
}
