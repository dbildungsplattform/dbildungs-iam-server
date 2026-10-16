import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_GROUP_MAN_DATA_SCHEMA, IMS_GROUP_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { ItslearningGroupLengthLimits } from '../../domain/groups.enum.js';
import { IMSESAction } from './base-action.js';

// Partial, actual structure contains more data
export type UpdateGroupParams = {
    id: string;

    name: string;
    type: 'Unspecified' | 'Site' | 'School' | 'Course' | 'CourseGroup';

    parentId: string;

    longDescription?: string;
    fullDescription?: string;
};

type UpdateGroupResponseBody = {
    updateGroupResponse: undefined;
};

export class UpdateGroupAction extends IMSESAction<UpdateGroupResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/gms/updateGroup';

    public constructor(private readonly params: UpdateGroupParams) {
        super();
    }

    public override buildRequest(): object {
        let extension: object[] | undefined;
        if (this.params.type === 'Course') {
            extension = [
                {
                    'ims1:fieldName': 'course',
                    'ims1:fieldType': 'String',
                    'ims1:fieldValue': this.params.name,
                },
                {
                    'ims1:fieldName': 'course/code',
                    'ims1:fieldType': 'String',
                    'ims1:fieldValue': this.params.name,
                },
            ];
        }

        return {
            'ims:updateGroupRequest': {
                '@_xmlns:ims': IMS_GROUP_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,
                '@_xmlns:ims2': IMS_GROUP_MAN_DATA_SCHEMA,

                'ims:sourcedId': {
                    'ims1:identifier': this.params.id,
                },

                'ims:group': {
                    'ims2:relationship': {
                        'ims2:relation': 'Parent',
                        'ims2:sourceId': {
                            'ims1:identifier': this.params.parentId,
                        },
                    },
                    'ims2:description': {
                        'ims2:descShort': this.params.name.slice(0, ItslearningGroupLengthLimits.SHORT_DESC),
                        'ims2:descLong': this.params.longDescription?.slice(0, ItslearningGroupLengthLimits.LONG_DESC),
                        'ims2:descFull': this.params.fullDescription?.slice(0, ItslearningGroupLengthLimits.FULL_DESC),
                    },
                    'ims2:extension': extension && { 'ims1:extensionField': extension },
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
