import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { SortFieldOrganisationsbeziehung } from '../domain/sort-field-organisationsbeziehung.enum.js';

export class FindOrganisationsbeziehungenQueryParams extends PagedQueryParams {
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
