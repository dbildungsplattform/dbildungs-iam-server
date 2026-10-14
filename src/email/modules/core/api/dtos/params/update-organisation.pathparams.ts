import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class UpdateOrganisationPathParams {
    @IsString()
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The id of the organisation.',
        required: true,
        nullable: false,
    })
    public readonly organisationId!: string;
}
