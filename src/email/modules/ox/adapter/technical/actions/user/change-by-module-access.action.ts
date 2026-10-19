import { type DomainError } from '../../../../../../../shared/error/index.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { type AuthParams, OxBaseAction } from '../ox-base-action.js';

// Incomplete
export type ChangeByModuleAccessParams = AuthParams & {
    contextId: string;

    userId: string;

    globalAddressBookDisabled: boolean;

    infostore: boolean;
};

export type ChangeByModuleAccessResponseBody = {
    body: undefined;
};

export class ChangeByModuleAccessAction extends OxBaseAction<ChangeByModuleAccessResponseBody, void> {
    public override action: string = 'http://soap.admin.openexchange.com/changeByModuleAccess';

    public override soapServiceName: string = 'OXUserService';

    public constructor(private readonly params: ChangeByModuleAccessParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:changeByModuleAccess': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },
                'tns:user': {
                    'ns6:id': this.params.userId,
                },
                'tns:moduleAccess': {
                    'ns6:globalAddressBookDisabled': this.params.globalAddressBookDisabled,
                    'ns6:infostore': this.params.infostore,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(): Result<void, DomainError> {
        // response does not contain relevant data
        return {
            ok: true,
            value: undefined,
        };
    }
}
