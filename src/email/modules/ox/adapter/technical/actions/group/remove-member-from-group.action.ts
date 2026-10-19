import { type DomainError } from '../../../../../../../shared/error/domain.error.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { OxBaseAction, type OXRequestStatus } from '../ox-base-action.js';
import { type GroupMemberParams } from './ox-group.types.js';

export type RemoveMemberFromGroupResponse = {
    status: OXRequestStatus;
    data: unknown;
};

export class RemoveMemberFromGroupAction extends OxBaseAction<unknown, RemoveMemberFromGroupResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/removeMember';

    public override soapServiceName: string = 'OXGroupService';

    public constructor(private readonly params: GroupMemberParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:removeMember': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:grp': {
                    //displayname and name could also be passed along
                    'ns6:id': this.params.groupId,
                },

                'tns:members': {
                    'ns6:id': this.params.memberId,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(body: unknown): Result<RemoveMemberFromGroupResponse, DomainError> {
        return {
            ok: true,
            value: {
                status: {
                    code: 'success',
                },
                data: body,
            },
        };
    }
}
