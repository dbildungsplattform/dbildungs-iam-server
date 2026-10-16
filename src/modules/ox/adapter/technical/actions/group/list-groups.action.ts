import { type DomainError } from '../../../../../../shared/error/domain.error.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { type AuthParams, OxBaseAction } from '../ox-base-action.js';
import { type OXGroup } from './ox-group.types.js';

export type ListGroupsParams = AuthParams & {
    contextId: string;

    pattern: string;
};

export type ListGroupsResponse = {
    groups: OXGroup[];
};

export type ListGroupsResponseBody = {
    listResponse: {
        return?: OXGroup[];
    };
};

export class ListGroupsAction extends OxBaseAction<ListGroupsResponseBody, ListGroupsResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/list';

    public override soapServiceName: string = 'OXGroupService';

    public constructor(private readonly params: ListGroupsParams) {
        super();
    }

    public override isArrayOverride(_tagName: string, jPath: string): boolean {
        return ['Envelope.Body.listResponse.return'].includes(jPath);
    }

    public override buildRequest(): object {
        return {
            'tns:list': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:pattern': this.params.pattern,

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(body: ListGroupsResponseBody): Result<ListGroupsResponse, DomainError> {
        const groups: OXGroup[] = [];

        for (const ret of body.listResponse.return ?? []) {
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
