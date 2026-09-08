import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { IsDIN91379AEXT } from '../../../shared/util/din-91379-validation.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { ServiceProviderKategorie, ServiceProviderMerkmal } from '../domain/service-provider.enum.js';
import { ALLOWED_LOGO_MIME_TYPES } from './allowed-mime-types.js';

export class CreateServiceProviderBodyParams {
    @IsUUID()
    @ApiProperty({
        description: 'The id of an organization',
        required: true,
        nullable: false,
    })
    public organisationId!: string;

    @ApiProperty()
    @IsDIN91379AEXT()
    @MaxLength(50)
    public name!: string;

    @ApiProperty()
    @MaxLength(2000)
    public url!: string;

    @ApiProperty({
        required: false,
        type: 'integer',
        description:
            'Optional logoId to use a standard logo. Has to be a positive integer. Only one of logoId or logoBase64 with logoMimeType can be provided, not both.',
        maximum: Math.pow(2, 31) - 1,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    @Max(Math.pow(2, 31) - 1)
    @IsOptional()
    public logoId?: number;

    @ApiProperty({
        required: false,
        description:
            'Optional logo as base64-encoded string. Only one of logoId or logoBase64 with logoMimeType can be provided, not both.',
    })
    @IsOptional()
    public logoBase64?: string;

    @ApiProperty({
        required: false,
        enum: ALLOWED_LOGO_MIME_TYPES,
        example: 'image/png',
    })
    @IsOptional()
    @IsIn(ALLOWED_LOGO_MIME_TYPES)
    public logoMimeType?: string;

    @ApiProperty({ enum: ServiceProviderKategorie })
    @IsEnum(ServiceProviderKategorie)
    public kategorie!: ServiceProviderKategorie;

    @ApiProperty({ required: true })
    @IsBoolean()
    public requires2fa!: boolean;

    @ApiProperty({ enum: ServiceProviderMerkmal, isArray: true })
    @IsEnum(ServiceProviderMerkmal, { each: true })
    public merkmale!: ServiceProviderMerkmal[];

    @ApiProperty({ required: false, enum: RollenArt, isArray: true })
    @IsOptional()
    @IsEnum(RollenArt, { each: true })
    public rollenartenWhitelist?: RollenArt[];
}
