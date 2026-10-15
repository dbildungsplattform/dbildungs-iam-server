import { faker } from '@faker-js/faker';
import { isOxErrorResponse, OxBaseAction } from './ox-base-action.js';
import { type DomainError } from '../../../../../../shared/error/index.js';
import { OxError } from '../../../../../../shared/error/ox.error.js';

function buildSuccessXMLResponse(): string {
    return `<soap:Envelope
xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body>
<createResponse
xmlns:ns5="http://exceptions.rmi.admin.openexchange.com/xsd"
xmlns:ns4="http://rmi.java/xsd"
xmlns:ns3="http://dataobjects.rmi.admin.openexchange.com/xsd"
xmlns:ns2="http://dataobjects.soap.admin.openexchange.com/xsd"
xmlns="http://soap.admin.openexchange.com">
<return>
<ns2:aliases>string</ns2:aliases>
<ns2:aliases>hugo.petersen@test.de</ns2:aliases>
<ns2:anniversary>2016-04-18Z</ns2:anniversary>
<ns2:assistant_name>string</ns2:assistant_name>
<ns2:birthday>2016-04-18Z</ns2:birthday>
<ns2:branches>string</ns2:branches>
<ns2:business_category>string</ns2:business_category>
<ns2:categories>string</ns2:categories>
<ns2:cellular_telephone1>string</ns2:cellular_telephone1>
<ns2:cellular_telephone2>string</ns2:cellular_telephone2>
<ns2:city_business>string</ns2:city_business>
<ns2:city_home>string</ns2:city_home>
<ns2:city_other>string</ns2:city_other>
<ns2:commercial_register>string</ns2:commercial_register>
<ns2:company>string</ns2:company>
<ns2:contextadmin>false</ns2:contextadmin>
<ns2:country_business>string</ns2:country_business>
<ns2:country_home>string</ns2:country_home>
<ns2:country_other>string</ns2:country_other>
<ns2:drive_user_folder_mode>default</ns2:drive_user_folder_mode>
<ns2:drive_folder_mode>default</ns2:drive_folder_mode>
<ns2:defaultSenderAddress>string</ns2:defaultSenderAddress>
<ns2:default_group
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:default_group>
<ns2:department>string</ns2:department>
<ns2:display_name>string</ns2:display_name>
<ns2:email1>hugo.petersen@test.de</ns2:email1>
<ns2:email2>string</ns2:email2>
<ns2:email3>string</ns2:email3>
<ns2:employeeType>string</ns2:employeeType>
<ns2:fax_business>string</ns2:fax_business>
<ns2:fax_home>string</ns2:fax_home>
<ns2:fax_other>string</ns2:fax_other>
<ns2:filestoreId>3</ns2:filestoreId>
<ns2:filestore_name>string</ns2:filestore_name>
<ns2:folderTree>3</ns2:folderTree>
<ns2:given_name>string</ns2:given_name>
<ns2:guiPreferencesForSoap
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:guiPreferencesForSoap>
<ns2:gui_spam_filter_enabled>true</ns2:gui_spam_filter_enabled>
<ns2:id>3</ns2:id>
<ns2:imapLogin>string</ns2:imapLogin>
<ns2:imapPort>3</ns2:imapPort>
<ns2:imapSchema>imap://</ns2:imapSchema>
<ns2:imapServer>string</ns2:imapServer>
<ns2:imapServerString>imap://string:3</ns2:imapServerString>
<ns2:info>string</ns2:info>
<ns2:instant_messenger1>string</ns2:instant_messenger1>
<ns2:instant_messenger2>string</ns2:instant_messenger2>
<ns2:language>de_DE</ns2:language>
<ns2:mail_folder_confirmed_ham_name>string</ns2:mail_folder_confirmed_ham_name>
<ns2:mail_folder_confirmed_spam_name>string</ns2:mail_folder_confirmed_spam_name>
<ns2:mail_folder_drafts_name>string</ns2:mail_folder_drafts_name>
<ns2:mail_folder_sent_name
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:mail_folder_sent_name>
<ns2:mail_folder_spam_name
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:mail_folder_spam_name>
<ns2:mail_folder_trash_name
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:mail_folder_trash_name>
<ns2:mail_folder_archive_full_name
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:mail_folder_archive_full_name>
<ns2:mailenabled>true</ns2:mailenabled>
<ns2:manager_name
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:manager_name>
<ns2:marital_status
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:marital_status>
<ns2:maxQuota
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:maxQuota>
<ns2:middle_name
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:middle_name>
<ns2:name>Hugo</ns2:name>
<ns2:nickname
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:nickname>
<ns2:note
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:note>
<ns2:number_of_children
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:number_of_children>
<ns2:number_of_employee
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:number_of_employee>
<ns2:password>TestPassword1</ns2:password>
<ns2:passwordMech>{SHA-256}</ns2:passwordMech>
<ns2:password_expired>false</ns2:password_expired>
<ns2:position
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:position>
<ns2:postal_code_business
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:postal_code_business>
<ns2:postal_code_home
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:postal_code_home>
<ns2:postal_code_other
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:postal_code_other>
<ns2:primaryEmail>hugo.petersen@test.de</ns2:primaryEmail>
<ns2:profession
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:profession>
<ns2:room_number
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:room_number>
<ns2:sales_volume
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:sales_volume>
<ns2:smtpPort>25</ns2:smtpPort>
<ns2:smtpSchema>smtp://</ns2:smtpSchema>
<ns2:smtpServer
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:smtpServer>
<ns2:smtpServerString
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:smtpServerString>
<ns2:spouse_name
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:spouse_name>
<ns2:state_business
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:state_business>
<ns2:state_home
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:state_home>
<ns2:state_other
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:state_other>
<ns2:street_business
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:street_business>
<ns2:street_home
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:street_home>
<ns2:street_other
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:street_other>
<ns2:suffix
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:suffix>
<ns2:sur_name>Petersen</ns2:sur_name>
<ns2:tax_id
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:tax_id>
<ns2:telephone_assistant
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_assistant>
<ns2:telephone_business1
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_business1>
<ns2:telephone_business2
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_business2>
<ns2:telephone_callback
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_callback>
<ns2:telephone_car
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_car>
<ns2:telephone_company
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_company>
<ns2:telephone_home1
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_home1>
<ns2:telephone_home2
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_home2>
<ns2:telephone_ip
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_ip>
<ns2:telephone_isdn
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_isdn>
<ns2:telephone_other
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_other>
<ns2:telephone_pager
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_pager>
<ns2:telephone_primary
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_primary>
<ns2:telephone_radio
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_radio>
<ns2:telephone_telex
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_telex>
<ns2:telephone_ttytdd
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:telephone_ttytdd>
<ns2:timezone
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:timezone>
<ns2:title
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:title>
<ns2:uploadFileSizeLimit
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:uploadFileSizeLimit>
<ns2:uploadFileSizeLimitPerFile
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:uploadFileSizeLimitPerFile>
<ns2:url
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:url>
<ns2:usedQuota
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:usedQuota>
<ns2:userAttributes>
<ns2:entries>
<ns2:key>config</ns2:key>
<ns2:value>
<ns2:entries>
<ns2:key>com.openexchange.mail.specialuse.check</ns2:key>
<ns2:value>true</ns2:value>
</ns2:entries>
</ns2:value>
</ns2:entries>
</ns2:userAttributes>
<ns2:userfield01
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield01>
<ns2:userfield02
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield02>
<ns2:userfield03
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield03>
<ns2:userfield04
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield04>
<ns2:userfield05
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield05>
<ns2:userfield06
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield06>
<ns2:userfield07
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield07>
<ns2:userfield08
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield08>
<ns2:userfield09
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield09>
<ns2:userfield10
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield10>
<ns2:userfield11
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield11>
<ns2:userfield12
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield12>
<ns2:userfield13
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield13>
<ns2:userfield14
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield14>
<ns2:userfield15
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield15>
<ns2:userfield16
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield16>
<ns2:userfield17
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield17>
<ns2:userfield18
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield18>
<ns2:userfield19
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield19>
<ns2:userfield20
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:userfield20>
<ns2:primaryAccountName
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:primaryAccountName>
<ns2:convert_drive_user_folders>false</ns2:convert_drive_user_folders>
<ns2:load_remote_mail_content_by_default
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:load_remote_mail_content_by_default>
<ns2:image1
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:image1>
<ns2:image1ContentType
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">
</ns2:image1ContentType>
</return>
</createResponse>
</soap:Body>
</soap:Envelope>
`;
}

function buildFailureXMLResponse(): string {
    return `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body>
<soap:Fault>
<faultcode>soap:Server</faultcode>
<faultstring>The displayname is already used; exceptionId -225208343-74</faultstring>
<detail>
<InvalidDataException xmlns:ns5="http://exceptions.rmi.admin.openexchange.com/xsd"
xmlns:ns4="http://rmi.java/xsd"
xmlns:ns3="http://dataobjects.rmi.admin.openexchange.com/xsd"
xmlns:ns2="http://dataobjects.soap.admin.openexchange.com/xsd"
xmlns="http://soap.admin.openexchange.com">
<InvalidDataException>
<Exception xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xsi:nil="true">
</Exception>
<ns5:objectname xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xsi:nil="true">
</ns5:objectname>
</InvalidDataException>
</InvalidDataException>
</detail>
</soap:Fault>
</soap:Body>
</soap:Envelope>
`;
}

type DummyResponse = {
    createResponse: {
        return: {
            email1: string;
        };
    };
};

class TestAction extends OxBaseAction<DummyResponse, string> {
    public action: string = faker.internet.url();

    public soapServiceName: string = 'TestService';

    public buildRequest(): object {
        return {};
    }

    public parseBody(body: DummyResponse): Result<string, DomainError> {
        return {
            ok: true,
            value: body.createResponse.return.email1,
        };
    }
}

describe('OxBaseAction', () => {
    describe('isOxErrorResponse', () => {
        describe('when passed object unknown object does not have properties of OxErrorResponse ', () => {
            it('should return IS NOT OxErrorResponse', () => {
                const result: boolean = isOxErrorResponse('A string does NOT have the properties of OxErrorResponse');

                expect(result).toBeFalsy();
            });
        });
    });

    describe('parseResponse', () => {
        it('should parse XML', () => {
            const xmlTest: string = buildSuccessXMLResponse();
            const testAction: TestAction = new TestAction();

            const result: Result<string, DomainError> = testAction.parseResponse(xmlTest);

            expect(result).toEqual({
                ok: true,
                value: 'hugo.petersen@test.de',
            });
        });

        it('should return OxError if response is an error', () => {
            const xmlTest: string = buildFailureXMLResponse();
            const testAction: TestAction = new TestAction();

            const result: Result<string, DomainError> = testAction.parseResponse(xmlTest);

            expect(result).toEqual({
                ok: false,
                error: new OxError('Request failed'),
            });
        });
    });
});
