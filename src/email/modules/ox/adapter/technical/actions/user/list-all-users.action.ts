import { type DomainError } from '../../../../../../../shared/error/index.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';

import { type AuthParams, OxBaseAction } from '../ox-base-action.js';
import { type OXUser } from './ox-user.types.js';

// Incomplete
export type ListAllUsersParams = AuthParams & {
    contextId: string;
};

export type ListAllUsersResponse = {
    users: OXUser[];
};

export type ListAllUsersResponseBody = {
    listAllResponse: {
        return: OXUser[];
    };
};

export class ListAllUsersAction extends OxBaseAction<ListAllUsersResponseBody, ListAllUsersResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/listAll';

    public override soapServiceName: string = 'OXUserService';

    public constructor(private readonly params: ListAllUsersParams) {
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

    public override parseBody(body: ListAllUsersResponseBody): Result<ListAllUsersResponse, DomainError> {
        const users: OXUser[] = [];
        for (const ret of body.listAllResponse.return) {
            users.push({
                id: ret.id,
                name: ret.name,
                email1: ret.email1,
                primaryEmail: ret.primaryEmail,
            });
        }
        return {
            ok: true,
            value: {
                users: users,
            },
        };
    }
}
