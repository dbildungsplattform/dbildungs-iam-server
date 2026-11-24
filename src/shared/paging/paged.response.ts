import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, ApiResponseOptions, getSchemaPath } from '@nestjs/swagger';
import { Paged } from './paged.js';
import { PagedQueryParams } from './paged.query.params.js';

export class PagedResponse<T> {
    @ApiProperty()
    public readonly total: number;

    @ApiProperty()
    public readonly offset: number;

    @ApiProperty()
    public readonly limit: number;

    @ApiProperty({ required: false })
    public readonly pageTotal?: number;

    @ApiProperty()
    public readonly items: T[];

    public constructor(page: Paged<T>) {
        this.total = page.total;
        this.offset = page.offset;
        this.limit = page.limit;
        this.items = page.items;
        this.pageTotal = page.pageTotal;
    }

    /**
     * Creates a PagedResponse from items and query parameters.
     *
     * @param items The items to include in the response.
     * @param total The total number of items before pagination.
     * Defaults to the length of the items array.
     * @param limit The maximum number of items to return.
     * Defaults to the total number of items.
     * @param offset The number of skipped items.
     * Defaults to 0.
     */
    public static fromItemsAndQuery<T>(
        { items = [], total = items.length }: Pick<Partial<Paged<T>>, 'items' | 'total'>,
        { limit = total, offset = 0 }: PagedQueryParams,
    ): PagedResponse<T> {
        return new PagedResponse<T>({
            total,
            offset,
            limit,
            items,
        });
    }
}

export const ApiOkResponsePaginated = <DataDto extends Type<unknown>>(
    dataDto: DataDto,
    options?: Omit<ApiResponseOptions, 'schema' | 'type'>,
): (<TFunction extends () => unknown, Y>(
    target: object | TFunction,
    propertyKey: string | symbol | undefined,
    descriptor: TypedPropertyDescriptor<Y> | undefined,
) => void) =>
    applyDecorators(
        ApiExtraModels(PagedResponse, dataDto),
        ApiOkResponse({
            ...options,
            schema: {
                allOf: [
                    { $ref: getSchemaPath(PagedResponse) },
                    {
                        required: ['items'],
                        properties: {
                            items: {
                                type: 'array',
                                items: { $ref: getSchemaPath(dataDto) },
                            },
                        },
                    },
                ],
            },
        }),
    );
