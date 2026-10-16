import { type DomainError } from '../../../../../../shared/error/domain.error.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { type AuthParams, OxBaseAction } from '../ox-base-action.js';
import { type OXGroup } from './ox-group.types.js';

export type ListGroupsForUserParams = AuthParams & {
    contextId: string;

    userId: string;
};

export type ListGroupsForUserResponse = {
    groups: OXGroup[];
};

export type ListGroupsForUserResponseBody = {
    listGroupsForUserResponse: {
        return: OXGroup | OXGroup[];
    };
};

export class ListGroupsForUserAction extends OxBaseAction<ListGroupsForUserResponseBody, ListGroupsForUserResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/listGroupsForUser';

    public override soapServiceName: string = 'OXGroupService';

    public constructor(private readonly params: ListGroupsForUserParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:listGroupsForUser': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:usr': {
                    'ns6:id': this.params.userId,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(body: ListGroupsForUserResponseBody): Result<ListGroupsForUserResponse, DomainError> {
        const groups: OXGroup[] = [];

        if (Array.isArray(body.listGroupsForUserResponse.return)) {
            for (const ret of body.listGroupsForUserResponse.return) {
                groups.push({
                    id: ret.id,
                    name: ret.name,
                    displayname: ret.displayname,
                    memberIds: ret.memberIds,
                });
            }
        } else {
            groups.push({
                id: body.listGroupsForUserResponse.return.id,
                name: body.listGroupsForUserResponse.return.name,
                displayname: body.listGroupsForUserResponse.return.displayname,
                memberIds: body.listGroupsForUserResponse.return.memberIds,
            });
        }

        return {
            ok: true,
            value: {
                groups: groups,
            },
        };
    }
}
