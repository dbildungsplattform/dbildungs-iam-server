import { faker } from '@faker-js/faker';
import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { ItsLearningError } from '../../../../../shared/error/its-learning.error.js';
import { IMSESMassAction, type MassResult, type StatusInfo } from './base-mass-action.js';
import { Err, Ok } from '../../../../../shared/util/result.js';

function buildXMLResponse(codeMajor: 'success' | 'failure', severity: 'status' | 'error', body: string): string {
    return `<s:Envelope
	xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
	xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
	<s:Header>
		<h:syncResponseHeaderInfo
			xmlns:h="http://www.imsglobal.org/services/common/imsMessBindSchema_v1p0"
			xmlns="http://www.imsglobal.org/services/common/imsMessBindSchema_v1p0"
			xmlns:xsd="http://www.w3.org/2001/XMLSchema"
			xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
			<messageIdentifier/>
            <statusInfoSet>
                <statusInfo>
                    <codeMajor>${codeMajor}</codeMajor>
                    <severity>${severity}</severity>
                    <messageIdRef/>
                </statusInfo>
            </statusInfoSet>
		</h:syncResponseHeaderInfo>
		<o:Security s:mustUnderstand="1"
			xmlns:o="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
			<u:Timestamp u:Id="_0">
				<u:Created>${faker.date.recent().toISOString()}</u:Created>
				<u:Expires>${faker.date.soon().toISOString()}</u:Expires>
			</u:Timestamp>
		</o:Security>
	</s:Header>
	<s:Body
		xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
		xmlns:xsd="http://www.w3.org/2001/XMLSchema">
		${body}
    </s:Body>
</s:Envelope>`;
}

type DummyResponse = {
    dummyResponse: string;
};

class TestAction extends IMSESMassAction<DummyResponse, string> {
    public action: string = faker.internet.url();

    public buildRequest(): object {
        return {};
    }

    public parseBody(body: DummyResponse): Result<string, DomainError> {
        if (body.dummyResponse === 'error') {
            return Err(new ItsLearningError('Parse Error'));
        } else {
            return Ok(body.dummyResponse);
        }
    }
}

describe('IMSESMassAction', () => {
    describe('parseResponse', () => {
        it('should parse XML', () => {
            const xmlTest: string = buildXMLResponse('success', 'status', '<dummyResponse>test</dummyResponse>');
            const testAction: TestAction = new TestAction();

            const result: Result<MassResult<string>, DomainError> = testAction.parseResponse(xmlTest);

            expect(result).toEqual<Result<MassResult<string>, DomainError>>({
                ok: true,
                value: {
                    status: [
                        expect.objectContaining({
                            codeMajor: 'success',
                            severity: 'status',
                        }) as StatusInfo,
                    ],
                    value: 'test',
                },
            });
        });

        it('should return error if action could not parse response', () => {
            const xmlTest: string = buildXMLResponse('success', 'status', '<dummyResponse>error</dummyResponse>');
            const testAction: TestAction = new TestAction();

            const result: Result<MassResult<string>, DomainError> = testAction.parseResponse(xmlTest);

            expect(result).toEqual({
                ok: false,
                error: new ItsLearningError('Parse Error'),
            });
        });
    });
});
