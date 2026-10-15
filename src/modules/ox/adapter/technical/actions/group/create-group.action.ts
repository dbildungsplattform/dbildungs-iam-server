import { type DomainError } from '../../../../../../shared/error/domain.error.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { type AuthParams, OxBaseAction } from '../ox-base-action.js';

export type CreateGroupParams = AuthParams & {
    contextId: string;

    displayname: string;
    name: string;
};

export type CreateGroupResponse = {
    displayname: string;
    id: string;
    name: string;
    memberIds: string[];
};

export type CreateGroupResponseBody = {
    createResponse: {
        return: {
            displayname: string;
            id: string;
            name: string;
            memberIds: string[];
        };
    };
};

export class CreateGroupAction extends OxBaseAction<CreateGroupResponseBody, CreateGroupResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/create';

    public override soapServiceName: string = 'OXGroupService';

    public constructor(private readonly params: CreateGroupParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:create': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:grp': {
                    //id and memberIds could also be set
                    'ns6:displayname': this.params.displayname,
                    'ns6:name': this.params.name,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(body: CreateGroupResponseBody): Result<CreateGroupResponse, DomainError> {
        return {
            ok: true,
            value: {
                displayname: body.createResponse.return.displayname,
                id: body.createResponse.return.id,
                name: body.createResponse.return.name,
                memberIds: body.createResponse.return.memberIds,
            },
        };
    }
}
