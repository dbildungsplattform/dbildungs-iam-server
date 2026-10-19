import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_PERSON_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { IMSESMassAction } from './base-mass-action.js';

type DeletePersonsResponseBody = {
    deletePersonsResponse: undefined;
};

export class DeletePersonsAction extends IMSESMassAction<DeletePersonsResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/pms/deletePersons';

    public constructor(private readonly ids: string[]) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:deletePersonsRequest': {
                '@_xmlns:ims': IMS_PERSON_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,

                'ims:sourcedIdSet': {
                    'ims1:identifier': this.ids,
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
