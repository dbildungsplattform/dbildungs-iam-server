import { Test, TestingModule } from '@nestjs/testing';
import { CommonTestModule } from '../../../test/utils/common-test.module.js';
import { createMock } from '../../../test/utils/createMock.js';
import { DatabaseTestModule, KeycloakConfigTestModule } from '../../../test/utils/index.js';
import { RolleRepo } from '../rolle/repo/rolle.repo.js';
import { PersonenkontextService } from './domain/personenkontext.service.js';
import { DBiamPersonenkontextRepo } from './persistence/dbiam-personenkontext.repo.js';
import { PersonenKontextApiModule } from './personenkontext-api.module.js';

describe('PersonenKontextApiModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
            ],
            imports: [
                CommonTestModule,
                DatabaseTestModule.forRoot(),
                PersonenKontextApiModule,
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
        it('should resolve PersonenkontextService', () => {
            expect(module.get(PersonenkontextService)).toBeInstanceOf(PersonenkontextService);
        });
    });
});
