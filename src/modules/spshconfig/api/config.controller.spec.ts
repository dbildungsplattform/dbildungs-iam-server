import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigController } from './config.controller.js';
import { ConfigTestModule } from '../../../../test/utils/index.js';
import { ConfigService } from '@nestjs/config';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { FeatureFlagResponse } from './featureflag.response.js';
import { type FeatureFlagConfig } from '../../../shared/config/featureflag.config.js';

describe('ConfigController', () => {
    let controller: ConfigController;
    let configServiceMock: DeepMocked<ConfigService>;

    const featureFlagConfig: Partial<FeatureFlagConfig> = {
        FEATURE_FLAG_ROLLE_BEARBEITEN: true,
    };

    beforeEach(async () => {
        configServiceMock = createMock(ConfigService);
        configServiceMock.getOrThrow.mockReturnValue(featureFlagConfig);

        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigTestModule],
            controllers: [ConfigController],
            providers: [{ provide: ConfigService, useValue: configServiceMock }],
        }).compile();

        controller = module.get<ConfigController>(ConfigController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
        expect(configServiceMock).toBeDefined();
    });

    it('should return values from config or default false', () => {
        const result: FeatureFlagResponse = controller.getFeatureFlags();
        expect(result).toBeDefined();
        expect(result).toBeInstanceOf(FeatureFlagResponse);
        expect(result.rolleBearbeitenEnabled).toBeTruthy();
        expect(result.befristungBearbeitenEnabled).toBeFalsy(); //Default
        expect(result.rolleErweiternEnabled).toBeFalsy(); //Default
    });
});
