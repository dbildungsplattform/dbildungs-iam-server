import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UserExternalDataBodyParams {
    @IsString()
    @ApiProperty({ required: true })
    public sub!: string;
}
