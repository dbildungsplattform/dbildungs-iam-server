import { ApiProperty } from '@nestjs/swagger';
import { DbiamError, DbiamErrorProps } from '../../../shared/error/dbiam.error.js';

export enum LandesbediensteterErrorI18nTypes {
    LANDESBEDIENSTETER_ERROR = 'LANDESBEDIENSTETER_ERROR',
    MISSING_PERMISSIONS = 'MISSING_PERMISSIONS',
    NOT_FOUND = 'NOT_FOUND',
}

export type LandesbediensteterErrorProps = DbiamErrorProps & {
    i18nKey: LandesbediensteterErrorI18nTypes;
};

export class LandesbediensteterError extends DbiamError {
    @ApiProperty({ enum: LandesbediensteterErrorI18nTypes })
    public override readonly i18nKey: string;

    public constructor(props: LandesbediensteterErrorProps) {
        super(props);
        this.i18nKey = props.i18nKey;
    }
}
