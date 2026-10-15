import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../test/utils/index.js';
import { PersonService } from './domain/person.service.js';
import { PersonModule } from './person.module.js';
import { EventModule } from '../../core/eventbus/index.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('PersonModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), PersonModule, EventModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve PersonService', () => {
            expect(module.get(PersonService)).toBeInstanceOf(PersonService);
        });
    });
});
