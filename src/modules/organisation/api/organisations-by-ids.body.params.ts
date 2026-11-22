import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class OrganisationsByIdsBodyParams {
    @IsArray()
    @IsUUID('4', { each: true })
    @ApiProperty({
        description: 'The ids of the organizations',
        required: true,
        nullable: false,
    })
    public organisationIds!: string[];
}
