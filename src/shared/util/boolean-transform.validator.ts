import { Transform, type TransformFnParams } from 'class-transformer';

// should be considered to be changed
export function TransformToBoolean(): PropertyDecorator {
    return Transform(({ obj, key }: TransformFnParams) => {
        const record: Record<string, unknown> = obj as Record<string, unknown>;
        const v: unknown = record[key];

        if (v === 'true' || v === '1') {
            return true;
        }
        if (v === 'false' || v === '0') {
            return false;
        }
        return v;
    });
}
