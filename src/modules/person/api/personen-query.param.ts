import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PagedQueryParams } from '../../../shared/paging/index.js';
import { SichtfreigabeType } from '../../personenkontext/domain/personenkontext.enums.js';
import { TransformToArray } from '../../../shared/util/array-transform.validator.js';
import {
    PersonLockOccasion,
    PersonLockOccasionTypName,
    SortFieldPerson,
    SortFieldPersonTypName,
} from '../domain/person.enums.js';
import { ScopeOrder, ScopeOrderTypName } from '../../../shared/persistence/scope.enums.js';

export class PersonenQueryParams extends PagedQueryParams {
    @IsOptional()
    @IsString()
    @ApiProperty({
        required: false,
        nullable: true,
    })
    public readonly username?: string;

    @IsOptional()
    @IsString()
    @ApiProperty({
        required: false,
        nullable: true,
    })
    public readonly familienname?: string;

    @IsOptional()
    @IsString()
    @ApiProperty({
        required: false,
        nullable: true,
    })
    public readonly vorname?: string;

    @IsOptional()
    @IsEnum(SichtfreigabeType)
    @ApiProperty({
        enum: SichtfreigabeType,
        default: SichtfreigabeType.NEIN,
        required: false,
        nullable: true,
    })
    public readonly sichtfreigabe: SichtfreigabeType = SichtfreigabeType.NEIN;

    @IsOptional()
    @TransformToArray()
    @IsUUID(undefined, { each: true })
    @ArrayUnique()
    @ApiProperty({
        required: false,
        nullable: true,
        isArray: true,
        description: 'List of Organisation ID used to filter for Persons.',
    })
    public readonly organisationIDs?: string[];

    @IsOptional()
    @TransformToArray()
    @IsUUID(undefined, { each: true })
    @ArrayUnique()
    @ApiProperty({
        required: false,
        nullable: true,
        isArray: true,
        description: 'List of Role ID used to filter for Persons.',
    })
    public readonly rolleIDs?: string[];

    @IsOptional()
    @TransformToArray()
    @IsEnum(PersonLockOccasion, { each: true })
    @ArrayUnique()
    @ApiProperty({
        enum: PersonLockOccasion,
        enumName: PersonLockOccasionTypName,
        required: false,
        nullable: true,
        isArray: true,
        description:
            'Filter persons with at least one of these lock reasons. Omit or pass an empty array to include all persons. Combined with other filters using AND.',
    })
    public readonly sperrgruende?: PersonLockOccasion[];

    @IsString()
    @IsOptional()
    @ApiProperty({
        description:
            'Search filter used to filter for Persons. It could be the vorname, familienname, username or the personalnummer.',
        required: false,
        nullable: true,
    })
    public readonly suchFilter?: string;

    @IsOptional()
    @IsEnum(ScopeOrder)
    @ApiProperty({
        enum: ScopeOrder,
        required: false,
        nullable: true,
        description: 'Order to sort by.',
        enumName: ScopeOrderTypName,
    })
    public readonly sortOrder?: ScopeOrder;

    @IsOptional()
    @IsEnum(SortFieldPerson)
    @ApiProperty({
        enum: SortFieldPerson,
        required: false,
        nullable: true,
        description: 'Field to sort by.',
        enumName: SortFieldPersonTypName,
    })
    public readonly sortField?: SortFieldPerson;
}
