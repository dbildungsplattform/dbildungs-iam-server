import { type Mock } from 'vitest';
import { InternalCommunicationApiKeyStrategy } from './internalcommunicationapikey.strategy.js';
import { UnauthorizedException } from '@nestjs/common';
import { EmailAppConfig } from '../../shared/config/email-app.config.js';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';

describe('Internal Communication ApiKey Strategy', () => {
    let configServiceMock: DeepMocked<EmailAppConfig>;
    let sut: InternalCommunicationApiKeyStrategy;
    let doneFunction: Mock;

    beforeEach(() => {
        configServiceMock = createMock(EmailAppConfig);
        doneFunction = vi.fn();
    });

    it('should validate the API key successfully', () => {
        const validApiKey: string = 'apikey123';
        Object.defineProperty(configServiceMock, 'HEADER_API_KEY', {
            value: {
                INTERNAL_COMMUNICATION_API_KEY: validApiKey,
            },
        });
        sut = new InternalCommunicationApiKeyStrategy(configServiceMock);
        sut.validate(validApiKey, doneFunction);

        expect(doneFunction).toHaveBeenCalledWith(null, true);
    });

    it('should return an UnauthorizedException if the API key is invalid', () => {
        const validApiKey: string = 'apikey123';
        const invalidApiKey: string = 'wrongapikey';
        Object.defineProperty(configServiceMock, 'HEADER_API_KEY', {
            value: {
                INTERNAL_COMMUNICATION_API_KEY: validApiKey,
            },
        });
        sut = new InternalCommunicationApiKeyStrategy(configServiceMock);
        sut.validate(invalidApiKey, doneFunction);

        expect(doneFunction).toHaveBeenCalledWith(expect.any(UnauthorizedException), null);
    });

    it('should return an UnauthorizedException if the API key is not set in the config', () => {
        Object.defineProperty(configServiceMock, 'HEADER_API_KEY', {
            value: {
                INTERNAL_COMMUNICATION_API_KEY: undefined,
            },
        });
        sut = new InternalCommunicationApiKeyStrategy(configServiceMock);
        sut.validate('anykey', doneFunction);

        expect(doneFunction).toHaveBeenCalledWith(expect.any(UnauthorizedException), null);
    });
});
