import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_PERSON_MAN_DATA_SCHEMA, IMS_PERSON_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { IMSESMassAction } from './base-mass-action.js';
import { type CreatePersonParams } from './create-person.action.js';

type CreatePersonsResponseBody = {
    createPersonResponse: undefined;
};

export class CreatePersonsAction extends IMSESMassAction<CreatePersonsResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/pms/createPersons';

    public constructor(private readonly params: CreatePersonParams[]) {
        super();
    }

    public override buildRequest(): object {
        const persons: object[] = this.params.map((p: CreatePersonParams) => ({
            'ims:sourcedId': {
                'ims1:identifier': p.id,
            },

            'ims:person': {
                'ims2:name': {
                    'ims2:partName': [
                        { 'ims2:namePartType': 'First', 'ims2:namePartValue': p.firstName },
                        { 'ims2:namePartType': 'Last', 'ims2:namePartValue': p.lastName },
                    ],
                },
                'ims1:email': p.email,
                'ims2:userId': {
                    'ims1:userIdValue': p.username,
                },
                'ims2:institutionRole': {
                    'ims2:institutionRoleType': p.institutionRoleType,
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
        }));

        return {
            'ims:createPersonsRequest': {
                '@_xmlns:ims': IMS_PERSON_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,
                '@_xmlns:ims2': IMS_PERSON_MAN_DATA_SCHEMA,

                'ims:personIdPairSet': {
                    'ims:personIdPair': persons,
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
