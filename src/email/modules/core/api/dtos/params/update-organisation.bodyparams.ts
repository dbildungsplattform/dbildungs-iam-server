import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateOrganisationBodyParams {
    @IsString()
    @IsNotEmpty()
    @ApiPropertyOptional({ description: 'The new name of the organisation.' })
    public readonly name!: string;
}
