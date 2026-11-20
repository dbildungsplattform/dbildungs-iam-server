import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { SortFieldOrganisationsbeziehung } from '../domain/sort-field-organisationsbeziehung.enum.js';

export class FindOrganisationsbeziehungenQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiPropertyOptional({
        required: false,
        nullable: true,
        description:
            'Search string used to filter the organisation relationships by name or Dienststellennummer of the other organisation.',
    })
    public readonly searchString?: string;

    @IsOptional()
    @IsEnum(ScopeOrder)
    @ApiPropertyOptional({
        enum: ScopeOrder,
        required: false,
        nullable: true,
        description: 'Order to sort by.',
    })
    public readonly sortOrder?: ScopeOrder;

    @IsOptional()
    @IsEnum(SortFieldOrganisationsbeziehung)
    @ApiPropertyOptional({
        enum: SortFieldOrganisationsbeziehung,
        enumName: 'SortFieldOrganisationsbeziehung',
        required: false,
        nullable: true,
        description: 'Field to sort by.',
    })
    public readonly sortField?: SortFieldOrganisationsbeziehung;
}
