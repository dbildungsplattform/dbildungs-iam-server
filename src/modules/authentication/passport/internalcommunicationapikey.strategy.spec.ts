import { type Mock } from 'vitest';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { InternalCommunicationApiKeyStrategy } from './internalcommunicationapikey.strategy.js';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('Internal Communication ApiKey Strategy', () => {
    let configServiceMock: DeepMocked<ConfigService>;
    let sut: InternalCommunicationApiKeyStrategy;
    let doneFunction: Mock;

    beforeEach(() => {
        configServiceMock = createMock(ConfigService);
        doneFunction = vi.fn();
    });

    it('should validate the API key successfully', () => {
        const validApiKey: string = 'apikey123';
        configServiceMock.getOrThrow.mockReturnValue({
            INTERNAL_COMMUNICATION_API_KEY: validApiKey,
        });
        sut = new InternalCommunicationApiKeyStrategy(configServiceMock);
        sut.validate(validApiKey, doneFunction);

        expect(doneFunction).toHaveBeenCalledWith(null, true);
    });

    it('should return an UnauthorizedException if the API key is invalid', () => {
        const validApiKey: string = 'apikey123';
        const invalidApiKey: string = 'wrongapikey';
        configServiceMock.getOrThrow.mockReturnValue({
            INTERNAL_COMMUNICATION_API_KEY: validApiKey,
        });
        sut = new InternalCommunicationApiKeyStrategy(configServiceMock);
        sut.validate(invalidApiKey, doneFunction);

        expect(doneFunction).toHaveBeenCalledWith(expect.any(UnauthorizedException), null);
    });

    it('should return an UnauthorizedException if the API key is not set in the config', () => {
        configServiceMock.getOrThrow.mockReturnValue({
            INTERNAL_COMMUNICATION_API_KEY: undefined,
        });
        sut = new InternalCommunicationApiKeyStrategy(configServiceMock);
        sut.validate('anykey', doneFunction);

        expect(doneFunction).toHaveBeenCalledWith(expect.any(UnauthorizedException), null);
    });
});
