import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsDIN91379AEXT } from '../../../shared/util/din-91379-validation.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderKategorie, ServiceProviderMerkmal } from '../domain/service-provider.enum.js';

export class UpdateServiceProviderBodyParams {
    @ApiProperty({ required: false })
    @IsDIN91379AEXT()
    @MaxLength(50)
    @IsOptional()
    public name?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(2000)
    public url?: string;

    @ApiProperty({
        required: false,
        enum: ServiceProviderKategorie,
    })
    @IsEnum(ServiceProviderKategorie)
    @IsOptional()
    public kategorie?: ServiceProviderKategorie;

    @ApiProperty({
        required: false,
        type: 'integer',
        nullable: true,
        description:
            'Optional logoId to use a standard logo. Has to be an integer. Can not be provided, if the service provider already has a custom logo. Null removes the logo.',
        maximum: Math.pow(2, 31) - 1,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    @Max(Math.pow(2, 31) - 1)
    @IsOptional()
    public logoId?: number | null;

    @ApiProperty({ required: false, enum: ServiceProviderMerkmal, isArray: true })
    @IsOptional()
    @IsEnum(ServiceProviderMerkmal, { each: true })
    public merkmale?: ServiceProviderMerkmal[];

    @ApiProperty({ required: false, enum: RollenArt, isArray: true })
    @IsOptional()
    @IsEnum(RollenArt, { each: true })
    public rollenartenWhitelist?: RollenArt[];
}
