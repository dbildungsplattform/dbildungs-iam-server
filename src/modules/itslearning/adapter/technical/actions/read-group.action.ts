import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_GROUP_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { IMSESAction } from './base-action.js';

export type GroupResponse = {
    name: string;
    type: string;
    parentId: string;
};

type ReadGroupResponseBody = {
    readGroupResponse: {
        group: {
            groupType: {
                scheme: string;
                typeValue: {
                    type: string;
                    level: number;
                };
            };
            relationship: {
                relation: string;
                sourceId: {
                    identifier: string;
                };
                label: string;
            };
            description: {
                descShort: string;
                descFull?: string;
            };
        };
    };
};

export class ReadGroupAction extends IMSESAction<ReadGroupResponseBody, GroupResponse> {
    public override action: string = 'http://www.imsglobal.org/soap/gms/readGroup';

    public constructor(private readonly id: string) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:readGroupRequest': {
                '@_xmlns:ims': IMS_GROUP_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,

                'ims:sourcedId': {
                    'ims1:identifier': this.id,
                },
            },
        };
    }

    public override parseBody(body: ReadGroupResponseBody): Result<GroupResponse, DomainError> {
        return {
            ok: true,
            value: {
                name: body.readGroupResponse.group.description.descShort,
                type: body.readGroupResponse.group.groupType.typeValue.type,
                parentId: body.readGroupResponse.group.relationship.sourceId.identifier,
            },
        };
    }
}
