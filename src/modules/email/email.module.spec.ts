import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule } from '../../../test/utils/index.js';
import { EmailModule } from './email.module.js';
import { EmailRepo } from './persistence/email.repo.js';
import { EmailFactory } from './domain/email.factory.js';
import { createMock } from '../../../test/utils/createMock.js';
import { PersonRepository } from '../person/persistence/person.repository.js';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';

describe('EmailModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot(), EmailModule],
            providers: [],
        })
            .overrideProvider(PersonRepository)
            .useValue(createMock(PersonRepository))
            .compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve EmailRepo', () => {
            expect(module.get(EmailRepo)).toBeInstanceOf(EmailRepo);
        });

        it('should resolve EmailFactory', () => {
            expect(module.get(EmailFactory)).toBeInstanceOf(EmailFactory);
        });
    });
});
