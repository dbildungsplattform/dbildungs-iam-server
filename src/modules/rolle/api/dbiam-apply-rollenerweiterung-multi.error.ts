import { ApiProperty } from '@nestjs/swagger';
import { ErrorIdType } from './ErrorIdType.enum.js';

export enum DbiamApplyRollenerweiterungMultiErrorI18NTypes {
    ROLLENERWEITERUNG_TECHNICAL_ERROR = 'ROLLENERWEITERUNG_TECHNICAL_ERROR',
    NOT_FOUND = 'NOT_FOUND',
    NO_REDUNDANT_ROLLENERWEITERUNG = 'NO_REDUNDANT_ROLLENERWEITERUNG',
}

export type DbiamApplyRollenerweiterungMultiErrorProps = {
    code: number;
    idsWithI18nKeys: {
        id: string;
        errorIdType: ErrorIdType;
        i18nKey: DbiamApplyRollenerweiterungMultiErrorI18NTypes;
    }[];
};

export class DbiamApplyRollenerweiterungMultiError {
    @ApiProperty({ description: 'Corresponds to HTTP Status code like 200, 404, 500' })
    public readonly code!: number;

    @ApiProperty({
        isArray: true,
        required: true,
        /* v8 ignore next */
        type: () => ({
            id: { type: 'string' },
            errorIdType: { type: 'string', enum: ErrorIdType },
            i18nKey: { type: 'string', enum: DbiamApplyRollenerweiterungMultiErrorI18NTypes },
        }),
    })
    public readonly idsWithI18nKeys: {
        id: string;
        errorIdType: ErrorIdType;
        i18nKey: DbiamApplyRollenerweiterungMultiErrorI18NTypes;
    }[] = [];

    public constructor(props: DbiamApplyRollenerweiterungMultiErrorProps) {
        this.code = props.code;
        this.idsWithI18nKeys = props.idsWithI18nKeys;
    }
}
