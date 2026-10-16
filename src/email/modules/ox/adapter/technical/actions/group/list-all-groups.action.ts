import { type DomainError } from '../../../../../../../shared/error/index.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';

import { type AuthParams, OxBaseAction } from '../ox-base-action.js';
import { type OXGroup } from './ox-group.types.js';

export type ListAllGroupsParams = AuthParams & {
    contextId: string;
};

export type ListAllGroupsResponse = {
    groups: OXGroup[];
};

export type ListAllGroupsResponseBody = {
    listAllResponse: {
        return: OXGroup[];
    };
};

export class ListAllGroupsAction extends OxBaseAction<ListAllGroupsResponseBody, ListAllGroupsResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/listAll';

    public override soapServiceName: string = 'OXGroupService';

    public constructor(private readonly params: ListAllGroupsParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:listAll': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(body: ListAllGroupsResponseBody): Result<ListAllGroupsResponse, DomainError> {
        const groups: OXGroup[] = [];
        for (const ret of body.listAllResponse.return) {
            groups.push({
                id: ret.id,
                name: ret.name,
                displayname: ret.displayname,
                memberIds: ret.memberIds,
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
