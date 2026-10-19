import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { IMS_COMMON_SCHEMA, IMS_GROUP_MAN_DATA_SCHEMA, IMS_GROUP_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { ItslearningGroupLengthLimits } from '../../domain/groups.enum.js';
import { IMSESMassAction } from './base-mass-action.js';
import { type CreateGroupParams } from './create-group.params.js';

type CreateGroupsResponseBody = {
    createGroupsResponse: undefined;
};

export class CreateGroupsAction extends IMSESMassAction<CreateGroupsResponseBody, void> {
    public override action: string = 'http://www.imsglobal.org/soap/gms/createGroups';

    public constructor(private readonly params: CreateGroupParams[]) {
        super();
    }

    public override buildRequest(): object {
        const groups: object[] = this.params.map((g: CreateGroupParams) => {
            let extension: object[] | undefined;
            if (g.type === 'Course') {
                extension = [
                    {
                        'ims1:fieldName': 'course',
                        'ims1:fieldType': 'String',
                        'ims1:fieldValue': g.name,
                    },
                    {
                        'ims1:fieldName': 'course/code',
                        'ims1:fieldType': 'String',
                        'ims1:fieldValue': g.name,
                    },
                ];
            }

            return {
                'ims:sourcedId': {
                    'ims1:identifier': g.id,
                },
                'ims:group': {
                    'ims2:groupType': {
                        'ims2:scheme': 'ItslearningOrganisationTypes',
                        'ims2:typeValue': {
                            'ims2:type': g.type,
                        },
                    },
                    'ims2:relationship': {
                        'ims2:relation': 'Parent',
                        'ims2:sourceId': {
                            'ims1:identifier': g.parentId,
                        },
                        'ims2:label': g.relationLabel,
                    },
                    'ims2:description': {
                        'ims2:descShort': g.name.slice(0, ItslearningGroupLengthLimits.SHORT_DESC),
                        'ims2:descLong': g.longDescription?.slice(0, ItslearningGroupLengthLimits.LONG_DESC),
                        'ims2:descFull': g.fullDescription?.slice(0, ItslearningGroupLengthLimits.FULL_DESC),
                    },
                    'ims2:extension': extension && { 'ims1:extensionField': extension },
                },
            };
        });

        return {
            'ims:createGroupsRequest': {
                '@_xmlns:ims': IMS_GROUP_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,
                '@_xmlns:ims2': IMS_GROUP_MAN_DATA_SCHEMA,

                'ims:groupIdPairSet': {
                    'ims:groupIdPair': groups,
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
