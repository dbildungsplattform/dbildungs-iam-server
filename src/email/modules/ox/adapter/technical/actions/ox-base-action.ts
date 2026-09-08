import { MatcherView, XMLBuilder, XMLParser } from 'fast-xml-parser';
import { OxError } from '../../../../../../shared/error/ox.error.js';
import { DomainError } from '../../../../../../shared/error/index.js';

export type OXRequestStatus =
    | {
          code: 'success';
      }
    | {
          code: 'failure';
      };
export type AuthParams = {
    login: string;
    password: string;
};

export type OxBaseResponse<BodyResponse> = {
    Envelope: {
        Body: BodyResponse;
    };
};

export type OxErrorResponse = {
    Envelope: {
        Body: {
            Fault: {
                faultcode: string;
                faultstring: string;
            };
        };
    };
};

export function isOxErrorResponse(err: unknown): err is OxErrorResponse {
    if (
        err &&
        typeof err === 'object' &&
        'Envelope' in err &&
        typeof err.Envelope === 'object' &&
        err.Envelope &&
        'Body' in err.Envelope &&
        typeof err.Envelope.Body === 'object' &&
        err.Envelope.Body &&
        'Fault' in err.Envelope.Body &&
        typeof err.Envelope.Body.Fault === 'object' &&
        err.Envelope.Body.Fault &&
        'faultstring' in err.Envelope.Body.Fault &&
        typeof err.Envelope.Body.Fault.faultstring === 'string' &&
        err.Envelope.Body.Fault.faultstring
    ) {
        return true;
    }

    return false;
}

export abstract class OxBaseAction<ResponseBodyType, ResultType> {
    protected readonly xmlBuilder: XMLBuilder = new XMLBuilder({ ignoreAttributes: false });

    protected readonly xmlParser: XMLParser = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        jPath: true,
        isArray: (tagName: string, jPathOrMatcher: string | MatcherView, isLeafNode: boolean, isAttribute: boolean) =>
            this.isArrayOverride(
                tagName,
                jPathOrMatcher as string, // Guaranteed to be string because we pass "jPath: true" above
                isLeafNode,
                isAttribute,
            ),
    });

    public abstract action: string;

    public abstract soapServiceName: string;

    public abstract buildRequest(): object;

    // Customize parsing behaviour, see X2jOptions.isArray
    public isArrayOverride(_tagName: string, _jPath: string, _isLeafNode: boolean, _isAttribute: boolean): boolean {
        return false;
    }

    /**
     * Will be called if the response was successful
     * @param body The contents of the response body
     */
    public abstract parseBody(body: ResponseBodyType): Result<ResultType, DomainError>;

    public parseResponse(input: string): Result<ResultType, DomainError> {
        const result: OxBaseResponse<ResponseBodyType> = this.xmlParser.parse(
            input,
        ) as OxBaseResponse<ResponseBodyType>;
        const errorResult: OxErrorResponse = this.xmlParser.parse(input) as OxErrorResponse;

        if (errorResult.Envelope.Body.Fault) {
            return {
                ok: false,
                error: new OxError('Request failed'),
            };
        } else {
            return this.parseBody(result.Envelope.Body);
        }
    }
}
