import { OxError } from '../../../../shared/error/ox.error.js';
import { type OxErrorResponse } from './actions/ox-base-action.js';
import { OxDisplaynameAlreadyUsedError } from '../domain/error/ox-displayname-already-used.error.js';
import { OxMemberAlreadyInGroupError } from '../domain/error/ox-member-already-in-group.error.js';
import { OxNoSuchUserError } from '../domain/error/ox-no-such-user.error.js';
import { OxPrimaryMailAlreadyExistsError } from '../domain/error/ox-primary-mail-already-exists.error.js';
import { OxPrimaryMailNotEqualEmail1Error } from '../domain/error/ox-primary-mail-not-equal-email1.error.js';
import { OxUsernameAlreadyExistsError } from '../domain/error/ox-username-already-exists.error.js';

export class OxErrorMapper {
    private static readonly USERNAME_ALREADY_EXISTS_REGEX: RegExp =
        /^User [A-Za-z0-9]* already exists in this context; exceptionId [\w\d-]*/;

    private static readonly DISPLAYNAME_ALDREADY_USED_REGEX: RegExp = /^The displayname is already used;[.]*/;

    private static readonly PRIMARY_MAIL_ADDRESS_ALREADY_EXISTS_REGEX: RegExp =
        /^Primary mail address \"[\w\d@\-\.]*\" already exists in context[.]*/;

    private static readonly PRIMARY_MAIL_ADDRESS_HAS_TO_EQUAL_EMAIL1_REGEX: RegExp =
        /^primarymail must have the same value as email1;[.]*/;

    private static readonly NO_SUCH_USER_REGEX: RegExp = /^No such user [\d]* in context [\d]*; exceptionId [\w\d-]*/;

    private static readonly MEMBER_ALREADY_IN_GROUP_REGEX: RegExp =
        /^Member already exists in group; exceptionId [\w\d-]*/;

    public static mapOxErrorResponseToOxError(oxErrorResponse: OxErrorResponse): OxError {
        const faultString: string = oxErrorResponse.Envelope.Body.Fault.faultstring;

        if (OxErrorMapper.USERNAME_ALREADY_EXISTS_REGEX.test(faultString)) {
            return new OxUsernameAlreadyExistsError(faultString);
        }
        if (OxErrorMapper.DISPLAYNAME_ALDREADY_USED_REGEX.test(faultString)) {
            return new OxDisplaynameAlreadyUsedError(faultString);
        }
        if (OxErrorMapper.PRIMARY_MAIL_ADDRESS_ALREADY_EXISTS_REGEX.test(faultString)) {
            return new OxPrimaryMailAlreadyExistsError(faultString);
        }
        if (OxErrorMapper.PRIMARY_MAIL_ADDRESS_HAS_TO_EQUAL_EMAIL1_REGEX.test(faultString)) {
            return new OxPrimaryMailNotEqualEmail1Error(faultString);
        }
        if (OxErrorMapper.NO_SUCH_USER_REGEX.test(faultString)) {
            return new OxNoSuchUserError(faultString);
        }
        if (OxErrorMapper.MEMBER_ALREADY_IN_GROUP_REGEX.test(faultString)) {
            return new OxMemberAlreadyInGroupError(faultString);
        }
        return new OxError(faultString);
    }
}
