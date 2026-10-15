import { type DomainError } from '../../../../../../shared/error/domain.error.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { OxBaseAction } from '../ox-base-action.js';
import { type UserIdParams } from './ox-user.types.js';

export type DeleteUserResponseBody = {
    body: undefined;
};

export class DeleteUserAction extends OxBaseAction<DeleteUserResponseBody, void> {
    public override action: string = 'http://soap.admin.openexchange.com/delete';

    public override soapServiceName: string = 'OXUserService';

    public constructor(private readonly params: UserIdParams) {
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

                'tns:user': {
                    'ns6:id': this.params.userId,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(): Result<void, DomainError> {
        return {
            ok: true,
            value: undefined,
        };
    }
}
