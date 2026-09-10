import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ApplyRollenerweiterungForSPPathParams {
    @IsString()
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The spshPersonId of the person.',
        required: true,
        nullable: false,
    })
    public readonly angebotId!: string;

    @IsString()
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The spshPersonId of the person.',
        required: true,
        nullable: false,
    })
    public readonly organisationId!: string;
}
