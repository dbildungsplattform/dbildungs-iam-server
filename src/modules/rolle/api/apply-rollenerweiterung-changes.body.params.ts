import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray } from 'class-validator';

export class ApplyRollenerweiterungChangesBodyParams {
    @IsUUID('all', { each: true })
    @IsArray()
    @ApiProperty({
        description: 'Array of ServiceProviderIds to add for the given rolle.',
        type: [String],
    })
    public addErweiterungenForServiceProviderIds!: string[];

    @IsUUID('all', { each: true })
    @IsArray()
    @ApiProperty({
        description: 'Array of ServiceProviderIds to remove for the given rolle.',
        type: [String],
    })
    public removeErweiterungenForServiceProviderIds!: string[];
}
