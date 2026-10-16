import { faker } from '@faker-js/faker';

import { GetDataForUserAction, type GetDataForUserResponseBody } from './get-data-user.action.js';

describe('GetDataUserAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const action: GetDataForUserAction = new GetDataForUserAction({
                contextId: faker.string.uuid(),
                userId: faker.string.uuid(),
                login: '',
                password: '',
            });

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('parseBody', () => {
        it('should return GetDataForUserResponse', () => {
            const action: GetDataForUserAction = new GetDataForUserAction({
                contextId: faker.string.uuid(),
                userId: faker.string.uuid(),
                login: '',
                password: '',
            });

            const body: GetDataForUserResponseBody = {
                getDataResponse: {
                    return: {
                        aliases: ['alias1', 'alias2'],
                        email1: 'string',
                        email2: 'string',
                        email3: 'string',
                        primaryEmail: 'string',
                        mailenabled: true,

                        id: 'id',
                        given_name: 'firstname',
                        sur_name: 'lastname',
                        name: 'username',
                    },
                },
            };
            expect(action.parseBody(body)).toEqual({
                ok: true,
                value: {
                    aliases: ['alias1', 'alias2'],
                    firstname: 'firstname',
                    lastname: 'lastname',
                    username: 'username',
                    id: 'id',
                    primaryEmail: 'string',
                    mailenabled: true,
                },
            });
        });
    });

    describe('isArrayOverride', () => {
        it('should return true for tag "aliases"', () => {
            const action: GetDataForUserAction = new GetDataForUserAction({
                contextId: faker.string.uuid(),
                userId: faker.string.uuid(),
                login: '',
                password: '',
            });

            expect(action.isArrayOverride('aliases')).toBe(true);
        });
    });
});
