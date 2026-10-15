import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule, KeycloakConfigTestModule } from '../../../test/utils/index.js';
import { PersonController } from './api/person.controller.js';
import { PersonApiModule } from './person-api.module.js';
import { PersonFrontendController } from './api/person.frontend.controller.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('PersonApiModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                CommonTestModule,
                DatabaseTestModule.forRoot(),
                PersonApiModule,
                KeycloakConfigTestModule.forRoot(),
            ],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve PersonController', () => {
            expect(module.get(PersonController)).toBeInstanceOf(PersonController);
        });

        it('should resolve PersonFrontendController', () => {
            expect(module.get(PersonFrontendController)).toBeInstanceOf(PersonFrontendController);
        });
    });
});
