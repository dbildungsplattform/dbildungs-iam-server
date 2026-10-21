import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../test/utils/index.js';
import { EventModule } from '../../core/eventbus/index.js';
import { PersonenInfoService } from './domain/personeninfo/personeninfo.service.js';
import { SchulconnexModule } from './schulconnex.module.js';
import { PersonInfoController } from './api/personinfo/person-info.controller.js';
import { PersonenInfoController } from './api/personeninfo/personeninfo.controller.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';
import { SchulconnexMapperService } from './domain/schulconnex-mapper.service.js';
import { SchulconnexPushAdapter } from './adapter/domain/schulconnex-push.adapter.js';
import { SchulconnexPushApiClient } from './adapter/technical/schulconnex-push-api.client.js';

describe('SchulconnexModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), EventModule, SchulconnexModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve SchulconnexMapperService', () => {
            expect(module.get(SchulconnexMapperService)).toBeInstanceOf(SchulconnexMapperService);
        });
        it('should resolve SchulconnexPushAdapter', () => {
            expect(module.get(SchulconnexPushAdapter)).toBeInstanceOf(SchulconnexPushAdapter);
        });
        it('should resolve SchulconnexPushApiClient', () => {
            expect(module.get(SchulconnexPushApiClient)).toBeInstanceOf(SchulconnexPushApiClient);
        });
        it('should resolve PersonenInfoService', () => {
            expect(module.get(PersonenInfoService)).toBeInstanceOf(PersonenInfoService);
        });
        it('should resolve PersonenInfoService', () => {
            expect(module.get(PersonInfoController)).toBeInstanceOf(PersonInfoController);
        });
        it('should resolve PersonenInfoService', () => {
            expect(module.get(PersonenInfoController)).toBeInstanceOf(PersonenInfoController);
        });
    });
});
