import { type DomainError } from '../../../../../shared/error/domain.error.js';

import { IMS_PERSON_MAN_MESS_SCHEMA } from '../../../schemas.js';
import { IMSESAction } from './base-action.js';

export type ReadAllPersonsParams = {
    pageIndex: number;
    pageSize: number;
    createdFrom?: Date;
    onlyManuallyCreatedUsers?: boolean;
    convertFromManual?: boolean;
};

export type PersonResponse = {
    id: string;
};

// Partial, actual structure contains more data
type PersonIdPair = {
    sourceId: {
        identifier: string;
    };
    person: {
        userId: {
            userIdValue: string;
        };
    };
};

// Partial, actual structure contains more data
type ReadAllPersonsReponseBody = {
    readAllPersonsResponse: {
        personIdPairSet: {
            personIdPair: PersonIdPair[];
        };
        virtualCount: number;
    };
};

function mapPersonIdPairToPersonResponse(idPair: PersonIdPair): PersonResponse {
    return {
        id: idPair.sourceId.identifier,
    };
}

export class ReadAllPersonsAction extends IMSESAction<ReadAllPersonsReponseBody, PersonResponse[]> {
    public override action: string = 'http://www.imsglobal.org/soap/pms/readAllPersons';

    public constructor(private readonly params: ReadAllPersonsParams) {
        super();
    }

    public override buildRequest(): object {
        return {
            'ims:readAllPersonsRequest': {
                '@_xmlns:ims': IMS_PERSON_MAN_MESS_SCHEMA,

                'ims:PageIndex': this.params.pageIndex,
                'ims:PageSize': this.params.pageSize,
                'ims:CreatedFrom': this.params.createdFrom?.toISOString(),
                'ims:OnlyManuallyCreatedUsers': this.params.onlyManuallyCreatedUsers,
                'ims:ConvertFromManual': this.params.convertFromManual,
            },
        };
    }

    public override isArrayOverride(tagName: string): boolean {
        return ['personIdPair', 'partName', 'tel'].includes(tagName);
    }

    public override parseBody(body: ReadAllPersonsReponseBody): Result<PersonResponse[], DomainError> {
        const persons: PersonResponse[] = body.readAllPersonsResponse.personIdPairSet.personIdPair.map(
            mapPersonIdPairToPersonResponse,
        );

        return {
            ok: true,
            value: persons,
        };
    }
}
