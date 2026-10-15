import { type Response } from 'express';
import { type Observable, map } from 'rxjs';
import { type CallHandler, type ExecutionContext, type NestInterceptor, SetMetadata, applyDecorators } from '@nestjs/common';
import { PagedResponse } from './paged.response.js';
import { PagingHeaders } from './paging.enums.js';

export const DISABLE_PAGING_INTERCEPTOR: symbol = Symbol('dont-transform-paging-response');

// Applying this decorator to an endpoint will disable the transformation of PagedResponse
export const DisablePagingInterceptor = (): MethodDecorator =>
    applyDecorators(SetMetadata(DISABLE_PAGING_INTERCEPTOR, true));

export class GlobalPagingHeadersInterceptor implements NestInterceptor {
    public intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
        const dontTransform: boolean = Reflect.getMetadata(DISABLE_PAGING_INTERCEPTOR, context.getHandler()) as boolean;
        if (dontTransform) {
            return next.handle();
        }

        return next.handle().pipe(
            map((value: unknown) => {
                if (value instanceof PagedResponse) {
                    const response: Response = context.switchToHttp().getResponse();

                    GlobalPagingHeadersInterceptor.setPaginationHeaders(response, value);

                    return value.items as unknown[];
                }

                return value;
            }),
        );
    }

    private static setPaginationHeaders<T>(response: Response, payload: PagedResponse<T>): void {
        response.setHeader(PagingHeaders.OFFSET, payload.offset);
        response.setHeader(PagingHeaders.LIMIT, payload.limit);
        response.setHeader(PagingHeaders.TOTAL, payload.total);
        response.setHeader(PagingHeaders.PAGE_TOTAL, payload.pageTotal ?? 0);
    }
}
