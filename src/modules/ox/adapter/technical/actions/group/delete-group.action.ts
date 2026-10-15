import { type DomainError } from '../../../../../../shared/error/domain.error.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { type AuthParams, OxBaseAction } from '../ox-base-action.js';

export type DeleteGroupParams = AuthParams & {
    contextId: string;
    id: string;
};
export type DeleteGroupResponse = object;
export type DeleteGroupResponseBody = object;

export class DeleteGroupAction extends OxBaseAction<DeleteGroupResponseBody, DeleteGroupResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/delete';

    public override soapServiceName: string = 'OXGroupService';

    public constructor(private readonly params: DeleteGroupParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:delete': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:grp': {
                    'ns6:id': this.params.id,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(_body: DeleteGroupResponseBody): Result<DeleteGroupResponse, DomainError> {
        return {
            ok: true,
            value: {},
        };
    }
}
