import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDate, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { PersonenzuordnungBodyParams } from './personenzuordnung.body.params.js';

export class PersonenzuordnungenBearbeitenBodyParams {
    @IsDate()
    @IsOptional()
    @ApiPropertyOptional({ nullable: true, description: 'Date of the most recently changed assignment.' })
    public readonly lastModified?: Date;

    @IsNumber()
    @ApiProperty({ description: 'Number of assignments in the current snapshot.' })
    public readonly count!: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PersonenzuordnungBodyParams)
    @ApiProperty({ type: [PersonenzuordnungBodyParams], description: 'Complete desired assignment set.' })
    public readonly personenkontexte!: PersonenzuordnungBodyParams[];
}
