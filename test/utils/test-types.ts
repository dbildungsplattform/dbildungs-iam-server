export type DeepPartial<T> = T extends object
    ? {
          [K in keyof T]?: DeepPartial<T[K]>;
      }
    : T;

export function expectOkResult<R, E extends Error>(res: Result<R, E>): asserts res is { ok: true; value: R } {
    expect(res.ok).toBe(true);
    if (!res.ok) {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Expected result to be okay');
    }
}

export function expectErrResult<R, E extends Error>(res: Result<R, E>): asserts res is { ok: false; error: E } {
    expect(res.ok).toBe(false);
    if (res.ok) {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('Expected result to be error');
    }
}
