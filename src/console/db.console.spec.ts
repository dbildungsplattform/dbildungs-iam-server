import { createMock, type DeepMocked } from '../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { ClassLogger } from '../core/logging/class-logger.js';
import { DbConsole } from './db.console.js';

describe('DbConsole', () => {
    let module: TestingModule;
    let sut: DbConsole;

    const classloggerMock: DeepMocked<ClassLogger> = createMock(ClassLogger);

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                DbConsole,
                {
                    provide: ClassLogger,
                    useValue: classloggerMock,
                },
            ],
        }).compile();
        sut = module.get(DbConsole);
    });

    afterAll(async () => {
        await module.close();
    });

    describe('run', () => {
        describe('when running the db command', () => {
            it('should print reminder, that no sub command was provided', async () => {
                await expect(sut.run([])).resolves.not.toThrow();
                expect(classloggerMock.info).toBeCalledWith('Did you forget the sub command?');
            });
        });
    });
});
