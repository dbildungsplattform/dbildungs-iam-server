import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';

export class FindServiceProviderForRolleQueryParams {
    @IsUUID()
    @ApiProperty({
        description: 'The id of the organisation where the service provider should be assignable on',
        required: true,
        nullable: false,
    })
    public readonly schulstrukturknotenOfRolle!: string;

    @IsEnum(RollenArt)
    @ApiProperty({
        enum: RollenArt,
        enumName: 'RollenArt',
        description: 'The rollenart of the rolle for which the service provider should be found',
        required: true,
        nullable: false,
    })
    public readonly rollenArt!: RollenArt;
}
