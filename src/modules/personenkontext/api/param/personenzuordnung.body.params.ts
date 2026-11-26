import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsOptional } from 'class-validator';
import { DbiamCreatePersonenkontextBodyParams } from './dbiam-create-personenkontext.body.params.js';

export class PersonenzuordnungBodyParams extends DbiamCreatePersonenkontextBodyParams {
    @IsDate()
    @IsOptional()
    @ApiPropertyOptional()
    public readonly befristung?: Date;
}
