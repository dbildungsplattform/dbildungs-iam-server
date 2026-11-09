import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Paged } from './paged.js';

export class SchulconnexPagedResponse<T> {
    @Exclude()
    public readonly total: number;

    @Exclude()
    public readonly offset: number;

    @Exclude()
    public readonly limit: number;

    @Exclude()
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
}
