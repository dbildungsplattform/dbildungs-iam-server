import { OxErrorMapper } from './ox-error.mapper.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { type OxErrorResponse } from '../../../../../modules/ox/adapter/technical/actions/ox-base-action.js';
import { faker } from '@faker-js/faker';
import { type OxError } from '../../../../../shared/error/ox.error.js';

describe('OXErrorMapper', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(OxErrorMapper).toBeDefined();
    });

    describe('mapOxErrorResponseToOxError', () => {
        let oxErrorResponse: OxErrorResponse;

        beforeEach(() => {
            oxErrorResponse = {
                Envelope: {
                    Body: {
                        Fault: {
                            faultcode: faker.string.numeric(),
                            faultstring: faker.string.alpha(),
                        },
                    },
                },
            };
        });

        it('when faultString does not match any regex for a specific OxError', () => {
            oxErrorResponse.Envelope.Body.Fault.faultstring = `another error message, not resulting in a specific OxErrror`;

            const oxError: OxError = OxErrorMapper.mapOxErrorResponseToOxError(oxErrorResponse);
            expect(oxError.code).toStrictEqual('OX_ERROR');
        });

        it('when faultString contains user already exists', () => {
            oxErrorResponse.Envelope.Body.Fault.faultstring = `User ${faker.string.alphanumeric()} already exists in this context; exceptionId -1234-054545`;

            const oxError: OxError = OxErrorMapper.mapOxErrorResponseToOxError(oxErrorResponse);
            expect(oxError.code).toStrictEqual('OX_USERNAME_ALREADY_EXISTS_ERROR');
        });

        it('when faultString contains displayname is already used', () => {
            oxErrorResponse.Envelope.Body.Fault.faultstring = `The displayname is already used; exceptionId -1234-054545`;

            const oxError: OxError = OxErrorMapper.mapOxErrorResponseToOxError(oxErrorResponse);
            expect(oxError.code).toStrictEqual('OX_DISPLAY_NAME_ALREADY_USED_ERROR');
        });

        it('when faultString contains primary mail-address already exists', () => {
            oxErrorResponse.Envelope.Body.Fault.faultstring = `Primary mail address "cmeier3@schule-sh.de" already exists in context 1`;

            const oxError: OxError = OxErrorMapper.mapOxErrorResponseToOxError(oxErrorResponse);
            expect(oxError.code).toStrictEqual('OX_PRIMARY_MAIL_ALREADY_EXISTS_ERROR');
        });

        it('when faultString contains info about mismatch between primary mail-address and email1', () => {
            oxErrorResponse.Envelope.Body.Fault.faultstring = `primarymail must have the same value as email1; exceptionId -1234-054545`;

            const oxError: OxError = OxErrorMapper.mapOxErrorResponseToOxError(oxErrorResponse);
            expect(oxError.code).toStrictEqual('OX_PRIMARY_MAIL_NOT_EQUAL_EMAIL1_ERROR');
        });

        it('when faultString contains info that no such user could be found', () => {
            oxErrorResponse.Envelope.Body.Fault.faultstring = `No such user(s) 21061985 in context 10; exceptionId -483860422-666`;

            const oxError: OxError = OxErrorMapper.mapOxErrorResponseToOxError(oxErrorResponse);
            expect(oxError.code).toStrictEqual('OX_NO_SUCH_USER_ERROR');
        });

        it('when faultString contains info that user could not be added as member to group', () => {
            oxErrorResponse.Envelope.Body.Fault.faultstring = `Member already exists in group; exceptionId -483860422-666`;

            const oxError: OxError = OxErrorMapper.mapOxErrorResponseToOxError(oxErrorResponse);
            expect(oxError.code).toStrictEqual('OX_MEMBER_ALREADY_IN_GROUP_ERROR');
        });
    });
});
