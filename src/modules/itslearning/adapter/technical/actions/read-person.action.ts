import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { ItsLearningError } from '../../../../../shared/error/its-learning.error.js';
import { IMS_COMMON_SCHEMA, IMS_PERSON_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { type IMSESInstitutionRoleType } from '../../domain/role.enum.js';
import { IMSESAction } from './base-action.js';

export type PersonResponse = {
    username: string;
    firstName: string;
    lastName: string;
    institutionRole: IMSESInstitutionRoleType;
    primaryRoleType: boolean;
};

// Partial, actual structure contains more data
type ReadPersonResponseBody = {
    readPersonResponse: {
        person: {
            name: {
                partName: {
                    namePartType: string;
                    namePartValue: string;
                }[];
            };
            email?: string;
            userId: {
                userIdValue: string;
            };
            institutionRole: {
                institutionRoleType: IMSESInstitutionRoleType;
                primaryRoleType: boolean;
            };
        };
    };
};

export class ReadPersonAction extends IMSESAction<ReadPersonResponseBody, PersonResponse> {
    public override action: string = 'http://www.imsglobal.org/soap/pms/readPerson';

    public constructor(private readonly id: string) {
        super();
    }

    public override isArrayOverride(tagName: string): boolean {
        return ['partName'].includes(tagName);
    }

    public override buildRequest(): object {
        return {
            'ims:readPersonRequest': {
                '@_xmlns:ims': IMS_PERSON_MAN_MESS_SCHEMA,
                '@_xmlns:ims1': IMS_COMMON_SCHEMA,

                'ims:sourcedId': {
                    'ims1:identifier': this.id,
                },
            },
        };
    }

    public override parseBody(body: ReadPersonResponseBody): Result<PersonResponse, DomainError> {
        const firstName: string | undefined = body.readPersonResponse.person.name.partName.find(
            ({ namePartType }: { namePartType: string }) => namePartType.toLowerCase() === 'first',
        )?.namePartValue;

        const lastName: string | undefined = body.readPersonResponse.person.name.partName.find(
            ({ namePartType }: { namePartType: string }) => namePartType.toLowerCase() === 'last',
        )?.namePartValue;

        if (!firstName || !lastName) {
            return {
                ok: false,
                error: new ItsLearningError('Person is missing a name.'),
            };
        }

        return {
            ok: true,
            value: {
                firstName,
                lastName,
                institutionRole: body.readPersonResponse.person.institutionRole.institutionRoleType,
                primaryRoleType: body.readPersonResponse.person.institutionRole.primaryRoleType,
                username: body.readPersonResponse.person.userId.userIdValue,
            },
        };
    }
}
