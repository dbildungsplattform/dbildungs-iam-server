import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_PERSON_MAN_DATA_SCHEMA, IMS_PERSON_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { type IMSESInstitutionRoleType } from '../../domain/role.enum.js';
import { IMSESAction } from './base-action.js';

// Partial, actual structure contains more data
export type CreatePersonParams = {
    id: string;

    firstName: string;
    lastName: string;

    username: string;

    institutionRoleType: IMSESInstitutionRoleType;

    email?: string;
};

type CreatePersonResponseBody = {
    createPersonResponse: undefined;
};

export class CreatePersonAction extends IMSESAction<CreatePersonResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/pms/createPerson';

    public constructor(private readonly params: CreatePersonParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:createPersonRequest': {
                '@_xmlns:ims': IMS_PERSON_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,
                '@_xmlns:ims2': IMS_PERSON_MAN_DATA_SCHEMA,

                'ims:sourcedId': {
                    'ims1:identifier': this.params.id,
                },

                'ims:person': {
                    'ims2:name': {
                        'ims2:partName': [
                            { 'ims2:namePartType': 'First', 'ims2:namePartValue': this.params.firstName },
                            { 'ims2:namePartType': 'Last', 'ims2:namePartValue': this.params.lastName },
                        ],
                    },
                    'ims1:email': this.params.email,
                    'ims2:userId': {
                        'ims1:userIdValue': this.params.username,
                    },
                    'ims2:institutionRole': {
                        'ims2:institutionRoleType': this.params.institutionRoleType,
                        'ims2:primaryRoleType': true,
                    },
                    'ims2:extension': {
                        'ims1:extensionField': {
                            'ims1:fieldName': 'passwordchange',
                            'ims1:fieldType': 'String',
                            'ims1:fieldValue': 'NotAllowed',
                        },
                    },
                },
            },
        };
    }

    public override parseBody(): Result<void, DomainError> {
        // Response does not contain data
        return {
            ok: true,
            value: undefined,
        };
    }
}
