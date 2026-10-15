import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_MEMBER_MAN_DATA_SCHEMA, IMS_MEMBER_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { type IMSESRoleType } from '../../domain/role.enum.js';
import { IMSESMassAction } from './base-mass-action.js';

// Partial, actual structure contains more data
export type CreateMembershipParams = {
    id: string;

    personId: string;
    groupId: string;
    roleType: IMSESRoleType;
};

type CreateMembershipsResponseBody = {
    createMembershipsResponse: undefined;
};

export class CreateMembershipsAction extends IMSESMassAction<CreateMembershipsResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/mms/createMemberships';

    public constructor(private readonly params: CreateMembershipParams[]) {
        super();
    }

    public override buildRequest(): object {
        const memberships: object[] = this.params.map((p: CreateMembershipParams) => ({
            'ims:sourcedId': {
                'ims1:identifier': p.id,
            },
            'ims:membership': {
                'ims2:groupSourcedId': {
                    'ims1:identifier': p.groupId,
                },
                'ims2:member': {
                    'ims2:memberSourcedId': {
                        'ims1:identifier': p.personId,
                    },
                    'ims2:role': {
                        'ims2:roleType': p.roleType,
                    },
                },
            },
        }));

        return {
            'ims:createMembershipsRequest': {
                '@_xmlns:ims': IMS_MEMBER_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,
                '@_xmlns:ims2': IMS_MEMBER_MAN_DATA_SCHEMA,

                'ims:membershipIdPairSet': {
                    'ims:membershipIdPair': memberships,
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
