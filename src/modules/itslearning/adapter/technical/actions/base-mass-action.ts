import { type MatcherView, XMLBuilder, XMLParser } from 'fast-xml-parser';

import { type DomainError } from '../../../../../shared/error/index.js';
import { Ok } from '../../../../../shared/util/result.js';
import { type ItslearningAction } from './action.types.js';

export type CommonStatusInfo = {
    codeMinor: {
        codeMinorField: {
            codeMinorName: string;
            codeMinorValue: string;
        }[];
    };
    description: {
        language: string;
        text: string;
    };
};

export type SuccessStatusInfo = {
    codeMajor: 'success';
    severity: 'status';
};

export type WarningStatusInfo = {
    codeMajor: 'success';
    severity: 'warning';
} & CommonStatusInfo;

export type FailureStatusInfo = {
    codeMajor: 'failure';
    severity: 'error';
} & CommonStatusInfo;

export type StatusInfo = SuccessStatusInfo | WarningStatusInfo | FailureStatusInfo;

export type BaseMassResponse<BodyResponse> = {
    Envelope: {
        Header: {
            syncResponseHeaderInfo: {
                statusInfoSet: {
                    statusInfo: StatusInfo[];
                };
            };
        };

        Body: BodyResponse;
    };
};

export type MassResult<ResultType> = {
    status: StatusInfo[];
    value: ResultType;
};

export abstract class IMSESMassAction<ResponseBodyType, ResultType> implements ItslearningAction<
    MassResult<ResultType>
> {
    protected readonly xmlBuilder: XMLBuilder = new XMLBuilder({ ignoreAttributes: false });

    protected readonly xmlParser: XMLParser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        isArray: (tagName: string, jPathOrMatcher: string | MatcherView, isLeafNode: boolean, isAttribute: boolean) =>
            tagName === 'statusInfo' ||
            tagName === 'codeMinorField' ||
            this.isArrayOverride(tagName, jPathOrMatcher, isLeafNode, isAttribute),
    });

    public abstract action: string;

    public abstract buildRequest(): object;

    // Customize parsing behaviour, see X2jOptions.isArray
    public isArrayOverride(
        _tagName: string,
        _jPathOrMatcher: string | MatcherView,
        _isLeafNode: boolean,
        _isAttribute: boolean,
    ): boolean {
        return false;
    }

    /**
     * Will be called if the response was successful
     * @param body The contents of the response body
     */
    public abstract parseBody(body: ResponseBodyType): Result<ResultType, DomainError>;

    public parseResponse(input: string): Result<MassResult<ResultType>, DomainError> {
        const result: BaseMassResponse<ResponseBodyType> = this.xmlParser.parse(
            input,
        ) as BaseMassResponse<ResponseBodyType>;

        const status: StatusInfo[] = result.Envelope.Header.syncResponseHeaderInfo.statusInfoSet.statusInfo;

        // If the action could not parse the response, return the error
        const parseResult: Result<ResultType, DomainError> = this.parseBody(result.Envelope.Body);
        if (!parseResult.ok) {
            return parseResult;
        }

        // Otherwise return all status in addition to the result
        return Ok({
            status,
            value: parseResult.value,
        });
    }
}
