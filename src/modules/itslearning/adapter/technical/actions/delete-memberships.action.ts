import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_MEMBER_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { IMSESMassAction } from './base-mass-action.js';

type DeleteMembershipsResponseBody = {
    deleteMembershipsResponse: undefined;
};

export class DeleteMembershipsAction extends IMSESMassAction<DeleteMembershipsResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/mms/deleteMemberships';

    public constructor(private readonly membershipIDs: string[]) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:deleteMembershipsRequest': {
                '@_xmlns:ims': IMS_MEMBER_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,

                'ims:sourcedIdSet': {
                    'ims1:identifier': this.membershipIDs,
                },
            },
        };
    }

    public override parseBody(): Result<void, DomainError> {
        // Response does not contain data
        return {
            ok: true,
            value: undefined,
        };
    }
}
