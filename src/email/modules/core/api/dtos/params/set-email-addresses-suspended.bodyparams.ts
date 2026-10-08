import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetEmailAddressesSuspendedBodyParams {
    @IsBoolean()
    @ApiProperty({
        description: 'Is the user is locked in SPSH',
        required: true,
        nullable: false,
    })
    public readonly gesperrt!: boolean;
}
