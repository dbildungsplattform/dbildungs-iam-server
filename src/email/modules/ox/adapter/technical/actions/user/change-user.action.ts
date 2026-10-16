import { type DomainError } from '../../../../../../../shared/error/index.js';
import { type OXUserID } from '../../../../../../../shared/types/ox-ids.types.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { type AuthParams, OxBaseAction } from '../ox-base-action.js';

// Incomplete
export type ChangeUserParams = AuthParams & {
    contextId: string;
    contextName: string;

    userId: OXUserID;
    username?: string;
    givenname?: string;
    surname?: string;
    displayname?: string;

    email1?: string;
    primaryEmail?: string;
    defaultSenderAddress?: string;
    aliases?: string[];

    imapLogin?: string;
};

export type ChangeUserResponseBody = {
    body: undefined;
};

export class ChangeUserAction extends OxBaseAction<ChangeUserResponseBody, void> {
    public override action: string = 'http://soap.admin.openexchange.com/change';

    public override soapServiceName: string = 'OXUserService';

    public constructor(private readonly params: ChangeUserParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:change': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:usrdata': {
                    'ns6:id': this.params.userId,
                    'ns6:email1': this.params.email1,
                    'ns6:name': this.params.username,
                    'ns6:given_name': this.params.givenname,
                    'ns6:sur_name': this.params.surname,
                    'ns6:display_name': this.params.displayname,
                    'ns6:primaryEmail': this.params.primaryEmail,
                    'ns6:defaultSenderAddress': this.params.defaultSenderAddress,
                    'ns6:aliases': this.params.aliases,
                    'ns6:imapLogin': this.params.email1,
                    'ns6:userAttributes': {
                        'ns6:entries': [
                            {
                                'ns6:key': 'loginnamerecorder',
                                'ns6:value': {
                                    'ns6:entries': {
                                        'ns6:key': 'user_login',
                                        'ns6:value': this.params.username + '@' + this.params.contextName,
                                    },
                                },
                            },
                        ],
                    },
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
