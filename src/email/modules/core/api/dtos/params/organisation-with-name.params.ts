import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class OrganisationWithNameParams {
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The id of the organisation',
        required: true,
        nullable: false,
    })
    public readonly id!: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The kennung of the organisation',
        required: true,
        nullable: false,
    })
    public readonly kennung!: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The name of the organisation',
        required: true,
        nullable: false,
    })
    public readonly name!: string;
}
