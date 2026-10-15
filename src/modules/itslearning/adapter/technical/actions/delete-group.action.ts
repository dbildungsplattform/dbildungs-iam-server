import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_GROUP_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { IMSESAction } from './base-action.js';

type DeleteGroupResponseBody = {
    deleteGroupResponse: undefined;
};

export class DeleteGroupAction extends IMSESAction<DeleteGroupResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/gms/deleteGroup';

    public constructor(private readonly id: string) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:deleteGroupRequest': {
                '@_xmlns:ims': IMS_GROUP_MAN_MESS_SCHEMA,
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
