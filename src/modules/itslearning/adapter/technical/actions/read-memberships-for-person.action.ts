import { type DomainError } from '../../../../../shared/error/domain.error.js';

import { IMS_COMMON_SCHEMA, IMS_MEMBER_MAN_MESS_SCHEMA, IMS_MESS_BIND_SCHEMA } from '../../../schemas.js';
import { type IMSESRoleType } from '../../domain/role.enum.js';
import { IMSESMassAction } from './base-mass-action.js';

export type ReadAllPersonsParams = {
    pageIndex: number;
    pageSize: number;
    createdFrom?: Date;
    onlyManuallyCreatedUsers?: boolean;
    convertFromManual?: boolean;
};

export type MembershipResponse = {
    id: string;
    groupId: string;
    role: IMSESRoleType;
};

// Partial, actual structure contains more data
export type MembershipIdPair = {
    sourcedId: {
        identifier: string;
    };
    membership: {
        groupSourcedId: {
            identifier: string;
        };
        member: {
            role: {
                roleType: IMSESRoleType;
            };
        };
    };
};

// Partial, actual structure contains more data
type ReadMembershipsForPersonReponseBody = {
    readMembershipsForPersonResponse: {
        membershipIDPairSet: {
            membershipIdPair: MembershipIdPair[];
        };
    };
};

function mapPersonIdPairToPersonResponse(idPair: MembershipIdPair): MembershipResponse {
    return {
        id: idPair.sourcedId.identifier,
        groupId: idPair.membership.groupSourcedId.identifier,
        role: idPair.membership.member.role.roleType,
    };
}

export class ReadMembershipsForPersonAction extends IMSESMassAction<
    ReadMembershipsForPersonReponseBody,
    MembershipResponse[]
> {
    public override action: string = 'http://www.imsglobal.org/soap/mms/readMembershipsForPerson';

    public constructor(private readonly personId: string) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:readMembershipsForPersonRequest': {
                '@_xmlns:ims': IMS_MEMBER_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,
                '@_xmlns:ims2': IMS_MESS_BIND_SCHEMA,

                'ims:personSourcedId': {
                    'ims1:identifier': this.personId,
                },
            },
        };
    }

    public override isArrayOverride(tagName: string): boolean {
        return ['membershipIdPair'].includes(tagName);
    }

    public override parseBody(body: ReadMembershipsForPersonReponseBody): Result<MembershipResponse[], DomainError> {
        const memberships: MembershipResponse[] =
            body.readMembershipsForPersonResponse.membershipIDPairSet.membershipIdPair.map(
                mapPersonIdPairToPersonResponse,
            );

        return {
            ok: true,
            value: memberships,
        };
    }
}
