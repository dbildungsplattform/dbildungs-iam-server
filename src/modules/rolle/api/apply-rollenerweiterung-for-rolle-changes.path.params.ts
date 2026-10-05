import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ApplyRollenerweiterungForRollePathParams {
    @IsString()
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The rolleId of the rolle.',
        required: true,
        nullable: false,
    })
    public readonly rolleId!: string;

    @IsString()
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The organisationId of the organisation.',
        required: true,
        nullable: false,
    })
    public readonly organisationId!: string;
}
