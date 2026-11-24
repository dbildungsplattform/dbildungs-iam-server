import { type Response } from 'express';
import { type Observable, map } from 'rxjs';
import { type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { SchulconnexPagedResponse } from './schulconnex-paged.response.js';
import { PagingHeaders } from './paging.enums.js';

export class GlobalPagingHeadersInterceptor implements NestInterceptor {
    public intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
        return next.handle().pipe(
            map((value: unknown) => {
                if (value instanceof SchulconnexPagedResponse) {
                    const response: Response = context.switchToHttp().getResponse();

                    GlobalPagingHeadersInterceptor.setPaginationHeaders(response, value);

                    return value.items as unknown[];
                }

                return value;
            }),
        );
    }

    private static setPaginationHeaders<T>(response: Response, payload: SchulconnexPagedResponse<T>): void {
        response.setHeader(PagingHeaders.OFFSET, payload.offset);
        response.setHeader(PagingHeaders.LIMIT, payload.limit);
        response.setHeader(PagingHeaders.TOTAL, payload.total);

        if (payload.pageTotal !== undefined) {
            response.setHeader(PagingHeaders.PAGE_TOTAL, payload.pageTotal);
        }
    }
}
