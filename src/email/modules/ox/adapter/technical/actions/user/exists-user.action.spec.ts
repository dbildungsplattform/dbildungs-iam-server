import { faker } from '@faker-js/faker';
import { ExistsUserAction, type ExistsUserResponseBody } from './exists-user.action.js';

describe('ExistsUserAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const username: string = faker.internet.username();

            const action: ExistsUserAction = new ExistsUserAction({
                contextId: faker.string.uuid(),
                userName: username,
                login: '',
                password: '',
            });

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('parseBody', () => {
        it('should return ExistsUserResponse', () => {
            const username: string = faker.internet.username();

            const action: ExistsUserAction = new ExistsUserAction({
                contextId: faker.string.uuid(),
                userName: username,
                login: '',
                password: '',
            });

            const body: ExistsUserResponseBody = {
                existsResponse: {
                    return: true,
                },
            };
            expect(action.parseBody(body)).toEqual({
                ok: true,
                value: {
                    exists: true,
                },
            });
        });
    });
});
