import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_PERSON_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { IMSESAction } from './base-action.js';

type DeletePersonResponseBody = {
    deletePersonResponse: undefined;
};

export class DeletePersonAction extends IMSESAction<DeletePersonResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/pms/deletePerson';

    public constructor(private readonly id: string) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:deletePersonRequest': {
                '@_xmlns:ims': IMS_PERSON_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,

                'ims:sourcedId': {
                    'ims1:identifier': this.id,
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
