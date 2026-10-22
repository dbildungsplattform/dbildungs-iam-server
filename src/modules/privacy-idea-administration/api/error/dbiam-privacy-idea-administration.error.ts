import { ApiProperty } from '@nestjs/swagger';
import { DbiamError, DbiamErrorProps } from '../../../../shared/error/dbiam.error.js';

export enum PrivacyIdeaAdministrationErrorI18nTypes {
    PRIVACY_IDEA_ADMINISTRATION_ERROR = 'PRIVACY_IDEA_ADMINISTRATION_ERROR',
    SERIENNUMMER_NICHT_GEFUNDEN = 'SERIENNUMMER_NICHT_GEFUNDEN',
    SERIENNUMMER_IN_VERWENDUNG = 'SERIENNUMMER_IN_VERWENDUNG',
    OTP_NICHT_GUELTIG = 'OTP_NICHT_GUELTIG',
    HARDWARE_TOKEN_SERVICE_FEHLER = 'HARDWARE_TOKEN_SERVICE_FEHLER',
    TOKEN_RESET_ERROR = 'TOKEN_RESET_ERROR',
    TWO_AUTH_STATE_ERROR = 'TWO_AUTH_STATE_ERROR',
    SOFTWARE_TOKEN_VERIFICATION_ERROR = 'SOFTWARE_TOKEN_VERIFICATION_ERROR',
    USERNAME_EXISTS_ERROR = 'USERNAME_EXISTS_ERROR',
    DELETE_USER_ERROR = 'DELETE_USER_ERROR',
    SOFTWARE_TOKEN_INITIALIZATION_ERROR = 'SOFTWARE_TOKEN_INITIALIZATION_ERROR',
    TOKEN_STATE_ERROR = 'TOKEN_STATE_ERROR',
    PI_UNAVAILABLE_ERROR = 'PI_UNAVAILABLE_ERROR',
}

export type DbiamPersonErrorProps = DbiamErrorProps & {
    i18nKey: PrivacyIdeaAdministrationErrorI18nTypes;
};

export class DbiamPrivacyIdeaAdministrationError extends DbiamError {
    @ApiProperty({ enum: PrivacyIdeaAdministrationErrorI18nTypes, enumName: 'PrivacyIdeaErrorEnum' })
    public override readonly i18nKey: string;

    public constructor(props: DbiamPersonErrorProps) {
        super(props);
        this.i18nKey = props.i18nKey;
    }
}
