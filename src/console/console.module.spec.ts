import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseTestModule, EmailConfigTestModule } from '../../test/utils/index.js';
import { ConsoleModule } from './console.module.js';
import { DbInitConsole } from './db-init.console.js';
import { DbConsole } from './db.console.js';
import { CommonTestModule } from '../../test/utils/common-test.module.js';

describe('ConsoleModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, EmailConfigTestModule, ConsoleModule, DatabaseTestModule.forRoot()],
        }).compile();
    });

    afterAll(async () => {
        if (module) {
            await module.close();
        }
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve DbConsole', () => {
            const service: DbConsole = module.get(DbConsole);
            expect(service).toBeInstanceOf(DbConsole);
        });

        it('should resolve DbInitConsole', () => {
            const service: DbInitConsole = module.get(DbInitConsole);
            expect(service).toBeInstanceOf(DbInitConsole);
        });
    });
});
