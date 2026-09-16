import { DomainError } from '../../../../../../../shared/error/index.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { AuthParams, OxBaseAction } from '../ox-base-action.js';
import { OXGroup } from './ox-group.types.js';

export type ListGroupsForUserParams = AuthParams & {
    contextId: string;

    userId: string;
};

export type ListGroupsForUserResponse = {
    groups: OXGroup[];
};

export type ListGroupsForUserResponseBody = {
    listGroupsForUserResponse: {
        return?: OXGroup[];
    };
};

export class ListGroupsForUserAction extends OxBaseAction<ListGroupsForUserResponseBody, ListGroupsForUserResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/listGroupsForUser';

    public override soapServiceName: string = 'OXGroupService';

    public constructor(private readonly params: ListGroupsForUserParams) {
        super();
    }

    public override isArrayOverride(_tagName: string, jPath: string): boolean {
        return [
            'Envelope.Body.listGroupsForUserResponse.return',
            'Envelope.Body.listGroupsForUserResponse.return.members',
        ].includes(jPath);
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
        const groups: OXGroup[] | undefined = body.listGroupsForUserResponse.return?.map((ret: OXGroup) => ({
            id: ret.id,
            name: ret.name,
            displayname: ret.displayname,
            memberIds: ret.memberIds,
        }));

        return {
            ok: true,
            value: {
                groups: groups ?? [],
            },
        };
    }
}
