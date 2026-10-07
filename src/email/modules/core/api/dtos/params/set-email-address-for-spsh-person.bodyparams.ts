import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsString, IsUUID, ValidateNested } from 'class-validator';
import { OrganisationWithNameParams } from './organisation-with-name.params.js';
import { Type } from 'class-transformer';

export class SetEmailAddressForSpshPersonBodyParams {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The username of the person.',
        required: true,
        nullable: false,
    })
    public readonly spshUsername!: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrganisationWithNameParams)
    @ApiProperty({
        description: 'Array of all schools the person is associated with in spsh.',
        required: true,
        nullable: false,
    })
    public readonly organisationen!: OrganisationWithNameParams[];

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The first name of the person in spsh.',
        required: true,
        nullable: false,
    })
    public readonly firstName!: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The last name of the person in spsh.',
        required: true,
        nullable: false,
    })
    public readonly lastName!: string;

    @IsBoolean()
    @ApiProperty({
        description: 'Is the user is locked in SPSH',
        required: true,
        nullable: false,
    })
    public readonly gesperrt!: boolean;

    @IsString()
    @IsUUID()
    @IsNotEmpty()
    @ApiProperty({
        description: 'The spshServiceProviderId from the email domain entity to be used.',
        required: true,
        nullable: false,
    })
    public readonly spshServiceProviderId!: string;
}
