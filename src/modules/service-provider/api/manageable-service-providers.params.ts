/* v8 ignore file @preserv */
// apparently v8 does not cover empty classes like this one, even though they are used in tests, so we have to ignore this file for coverage purposes.
// is this class necessary or should we remove it? There are more like this.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsEnum, IsOptional, IsString } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';
import { TransformToArray } from '../../../shared/util/array-transform.validator.js';
import { ServiceProviderKategorie, ServiceProviderKategorieTypName } from '../domain/service-provider.enum.js';

export class ManageableServiceProvidersParams extends PagedQueryParams {
    @IsOptional()
    @TransformToArray()
    @IsEnum(ServiceProviderKategorie, { each: true })
    @ArrayUnique()
    @ArrayMaxSize(Object.values(ServiceProviderKategorie).length)
    @ApiProperty({
        required: false,
        nullable: true,
        isArray: true,
        enum: ServiceProviderKategorie,
        enumName: ServiceProviderKategorieTypName,
    })
    public readonly kategorien?: ServiceProviderKategorie[];

    @IsString()
    @IsOptional()
    @ApiPropertyOptional({
        required: false,
        nullable: true,
    })
    public readonly searchFilter?: string;
}
