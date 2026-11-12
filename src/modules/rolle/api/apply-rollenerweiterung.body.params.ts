import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsUUID } from 'class-validator';

export class ApplyRollenerweiterungBodyParams {
    @IsArray()
    @IsUUID(undefined, { each: true })
    @IsString({ each: true })
    @ApiProperty({
        description: 'List of rolleIds to apply.',
        type: [String],
        required: true,
        example: ['7799a7ba-af22-47ab-8595-53caba21825d', '1326e205-4f35-46b1-88e2-990826aedc9b'],
    })
    public readonly addErweiterungenForRolleIds!: string[];

    @IsArray()
    @IsUUID(undefined, { each: true })
    @IsString({ each: true })
    @ApiProperty({
        description: 'List of rolleIds to remove.',
        type: [String],
        required: true,
        example: ['7799a7ba-af22-47ab-8595-53caba21825d', '1326e205-4f35-46b1-88e2-990826aedc9b'],
    })
    public readonly removeErweiterungenForRolleIds!: string[];
}
