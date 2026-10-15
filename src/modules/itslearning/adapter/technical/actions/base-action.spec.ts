import { type DomainError } from '../../../../../shared/error/domain.error.js';
import { ItsLearningError } from '../../../../../shared/error/its-learning.error.js';
import { IMSESAction } from './base-action.js';
import { faker } from '@faker-js/faker';

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
			<statusInfo>
				<codeMajor>${codeMajor}</codeMajor>
				<severity>${severity}c</severity>
				<messageIdRef/>
			</statusInfo>
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

class TestAction extends IMSESAction<DummyResponse, string> {
    public action: string = faker.internet.url();

    public buildRequest(): object {
        return {};
    }

    public parseBody(body: DummyResponse): Result<string, DomainError> {
        return {
            ok: true,
            value: body.dummyResponse,
        };
    }
}

describe('IMSESAction', () => {
    describe('parseResponse', () => {
        it('should parse XML', () => {
            const xmlTest: string = buildXMLResponse('success', 'status', '<dummyResponse>test</dummyResponse>');
            const testAction: TestAction = new TestAction();

            const result: Result<string, DomainError> = testAction.parseResponse(xmlTest);

            expect(result).toEqual({
                ok: true,
                value: 'test',
            });
        });

        it('should return ItsLearningError if response is an error', () => {
            const xmlTest: string = buildXMLResponse('failure', 'error', '<dummyResponse/>');
            const testAction: TestAction = new TestAction();

            const result: Result<string, DomainError> = testAction.parseResponse(xmlTest);

            expect(result).toEqual({
                ok: false,
                error: new ItsLearningError('Request failed', expect.anything() as Record<string, unknown>),
            });
        });
    });
});
