import { MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthIndicatorResult, HealthIndicatorStatus, TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health-indicator.js';

let error: Error | string | undefined = undefined;

const executeDatabaseQuery = function (): Promise<unknown> {
    if (error === undefined) {
        return Promise.resolve([{ result: 1 }]);
    }

    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return Promise.reject(error);
};

describe('Database health indicator', () => {
    let module: TestingModule;

    beforeAll(async () => {
        const mikroOrmMock: object = {
            em: {
                fork: function () {
                    return {
                        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
                        getConnection: function () {
                            return {
                                execute: executeDatabaseQuery,
                            };
                        },
                    };
                },
            },
        };

        module = await Test.createTestingModule({
            imports: [TerminusModule],
            providers: [
                DatabaseHealthIndicator,
                {
                    provide: MikroORM,
                    useValue: mikroOrmMock,
                },
            ],
        }).compile();
    });

    beforeEach(() => {
        error = undefined;
    });

    it('should report a successful database query as the database being up', async () => {
        const databaseHealthIndicator: DatabaseHealthIndicator =
            module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);

        const checkResult: HealthIndicatorResult = await databaseHealthIndicator.check();

        expect(checkResult['database']).toBeDefined();
        expect(checkResult['database']?.status).toBe('up');
    });

    it('should report a failed database query as the database being down and show the error message', async () => {
        error = new Error('Connection refused');

        const databaseHealthIndicator: DatabaseHealthIndicator =
            module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);

        const checkResult:
            | {
                  status: HealthIndicatorStatus;
                  [options: string]: string;
              }
            | undefined = await databaseHealthIndicator
            .check()
            .then((result: HealthIndicatorResult) => result['database']);

        expect(checkResult).toBeDefined();
        expect(checkResult?.status).toBe('down');
        expect(checkResult?.['message']).toBe('Database is not reachable: Connection refused');
    });

    it('should report a failed database query as down when there is no error message available', async () => {
        error = 'something horrible happened';

        const databaseHealthIndicator: DatabaseHealthIndicator =
            module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);

        const checkResult:
            | {
                  status: HealthIndicatorStatus;
                  [options: string]: string;
              }
            | undefined = await databaseHealthIndicator
            .check()
            .then((result: HealthIndicatorResult) => result['database']);

        expect(checkResult).toBeDefined();
        expect(checkResult?.status).toBe('down');
        expect(checkResult?.['message']).toBe('Database is not reachable and there is no error message available');
    });
});
