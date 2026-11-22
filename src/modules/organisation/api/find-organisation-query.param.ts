import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';
import { ScopeOrder } from '../../../shared/persistence/scope.enums.js';
import { TransformToArray } from '../../../shared/util/array-transform.validator.js';
import { RollenSystemRechtEnum, RollenSystemRechtEnumName } from '../../rolle/domain/systemrecht.js';
import { OrganisationsTyp, OrganisationsTypName, SortFieldOrganisation } from '../domain/organisation.enums.js';
import { TransformToBoolean } from '../../../shared/util/boolean-transform.validator.js';

export class FindOrganisationQueryParams extends PagedQueryParams {
    @IsString()
    @IsOptional()
    @ApiProperty({
        required: false,
        nullable: true,
    })
    public readonly kennung?: string;

    @IsString()
    @IsOptional()
    @ApiProperty({
        required: false,
        nullable: true,
    })
    public readonly name?: string;

    @IsString()
    @IsOptional()
    @ApiProperty({
        required: false,
        nullable: true,
    })
    public readonly searchString?: string;

    @IsEnum(OrganisationsTyp)
    @IsOptional()
    @ApiProperty({
        required: false,
        nullable: true,
        enum: OrganisationsTyp,
        enumName: OrganisationsTypName,
        default: OrganisationsTyp.SONSTIGE,
    })
    public readonly typ?: OrganisationsTyp;

    @IsOptional()
    @TransformToArray()
    @IsEnum(RollenSystemRechtEnum, { each: true })
    @ArrayUnique()
    @ApiProperty({
        required: false,
        nullable: true,
        isArray: true,
        enum: RollenSystemRechtEnum,
        enumName: RollenSystemRechtEnumName,
    })
    public readonly systemrechte: RollenSystemRechtEnum[] = [];

    @IsOptional()
    @TransformToArray()
    @IsEnum(OrganisationsTyp, { each: true })
    @ArrayUnique()
    @ApiProperty({
        required: false,
        nullable: true,
        enum: OrganisationsTyp,
        enumName: OrganisationsTypName,
        isArray: true,
    })
    public readonly excludeTyp?: OrganisationsTyp[];

    @IsOptional()
    @TransformToArray()
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    @ApiProperty({
        required: false,
        nullable: true,
        isArray: true,
    })
    public readonly administriertVon?: string[];

    @IsOptional()
    @TransformToArray()
    @ArrayUnique()
    @IsUUID(undefined, { each: true })
    @ApiProperty({
        required: false,
        nullable: true,
        isArray: true,
        description: 'Liefert die Kind-Organisationen, die den angegebenen IDs zugehörig sind.',
    })
    public readonly zugehoerigZu?: string[];

    @IsOptional()
    @IsEnum(ScopeOrder)
    @ApiProperty({
        enum: ScopeOrder,
        required: false,
        nullable: true,
        description: 'Order to sort by.',
    })
    public readonly sortOrder?: ScopeOrder;

    @IsOptional()
    @IsEnum(SortFieldOrganisation)
    @ApiProperty({
        enum: SortFieldOrganisation,
        required: false,
        nullable: true,
        description: 'Field to sort by.',
    })
    public readonly sortField?: SortFieldOrganisation;

    @IsOptional()
    @IsBoolean()
    @TransformToBoolean()
    @ApiProperty({
        required: false,
        nullable: true,
    })
    public readonly getChildrenRecursively?: boolean;
}
