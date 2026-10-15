import { Test, type TestingModule } from '@nestjs/testing';

import { LoggingTestModule } from '../../../test/utils/logging-test.module.js';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { KeycloakCommand } from './keycloak.command.js';
import { type DeepMocked } from '../../../test/utils/createMock.js';

describe('KeycloakCommand', () => {
    let module: TestingModule;
    let sut: KeycloakCommand;

    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [KeycloakCommand],
        }).compile();

        sut = module.get(KeycloakCommand);
        loggerMock = module.get(ClassLogger);
    });

    afterAll(async () => {
        await module.close();
    });

    describe('run', () => {
        describe('when running the keycloak command', () => {
            it('should print reminder, that no sub command was provided', async () => {
                await expect(sut.run([])).resolves.not.toThrow();
                expect(loggerMock.info).toBeCalledWith('Did you forget the sub command?');
            });
        });
    });
});
