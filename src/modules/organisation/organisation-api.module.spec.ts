import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../test/utils/index.js';
import { OrganisationApiModule } from './organisation-api.module.js';
import { OrganisationController } from './api/organisation.controller.js';
import { DBiamPersonenkontextRepo } from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonenkontextFactory } from '../personenkontext/domain/personenkontext.factory.js';
import { PersonenKontextModule } from '../personenkontext/personenkontext.module.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('OrganisationApiModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), OrganisationApiModule, PersonenKontextModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be definded', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve OrganisationController', () => {
            expect(module.get(OrganisationController)).toBeInstanceOf(OrganisationController);
        });

        it('should resolve DBiamPersonenkontextRepo', () => {
            expect(module.get(DBiamPersonenkontextRepo)).toBeInstanceOf(DBiamPersonenkontextRepo);
        });

        it('should resolve PersonenkontextFactory', () => {
            expect(module.get(PersonenkontextFactory)).toBeInstanceOf(PersonenkontextFactory);
        });
    });
});
