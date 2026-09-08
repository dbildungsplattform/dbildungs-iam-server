import { DomainError } from '../../../../../../../shared/error/index.js';
import { NS2_SCHEMA, NS6_SCHEMA, TNS_SCHEMA } from '../../schemas.js';
import { AuthParams, OxBaseAction } from '../ox-base-action.js';

// Incomplete
export type CreateUserParams = AuthParams & {
    contextId: string;

    displayName: string; //has to be unique in OX
    email1: string; //has to be unique in OX
    username: string; //has to be unique in OX
    firstname: string;
    mailEnabled: boolean;
    lastname: string;
    primaryEmail: string; //has to be unique in OX
    userPassword: string; //has to be set, OX is not allowing undefined or empty pasword
};

export type CreateUserResponse = {
    id: string;
    firstname: string;
    lastname: string;
    username: string;
    primaryEmail: string;
    mailenabled: boolean;
};

export type CreateUserResponseBody = {
    createByModuleAccessResponse: {
        return: {
            id: string;
            aliases: [];
            email1: string;
            email2: string;
            email3: string;
            primaryEmail: string;

            name: string;
            given_name: string;
            sur_name: string;
            mailenabled: boolean;
        };
    };
};

export class CreateUserAction extends OxBaseAction<CreateUserResponseBody, CreateUserResponse> {
    public override action: string = 'http://soap.admin.openexchange.com/createByModuleAccess';

    public override soapServiceName: string = 'OXUserService';

    public constructor(private readonly params: CreateUserParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'tns:createByModuleAccess': {
                '@_xmlns:tns': TNS_SCHEMA,
                '@_xmlns:ns2': NS2_SCHEMA,
                '@_xmlns:ns6': NS6_SCHEMA,

                'tns:ctx': {
                    'ns6:id': this.params.contextId,
                },

                'tns:usrdata': {
                    'ns6:display_name': this.params.displayName,
                    'ns6:email1': this.params.email1,
                    'ns6:given_name': this.params.firstname,
                    'ns6:mailenabled': this.params.mailEnabled,
                    'ns6:name': this.params.username,
                    'ns6:sur_name': this.params.lastname,
                    'ns6:primaryEmail': this.params.primaryEmail,
                    'ns6:language': 'de_DE',
                    'ns6:password': this.params.userPassword,
                },

                'tns:access': {
                    'ns6:globalAddressBookDisabled': true,
                    'ns6:infostore': false,
                },

                'tns:auth': {
                    'ns2:login': this.params.login,
                    'ns2:password': this.params.password,
                },
            },
        };
    }

    public override parseBody(body: CreateUserResponseBody): Result<CreateUserResponse, DomainError> {
        return {
            ok: true,
            value: {
                id: String(body.createByModuleAccessResponse.return.id),
                firstname: body.createByModuleAccessResponse.return.given_name,
                lastname: body.createByModuleAccessResponse.return.sur_name,
                username: body.createByModuleAccessResponse.return.name,
                primaryEmail: body.createByModuleAccessResponse.return.primaryEmail,
                mailenabled: body.createByModuleAccessResponse.return.mailenabled,
            },
        };
    }
}
