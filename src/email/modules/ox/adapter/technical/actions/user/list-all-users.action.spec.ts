import { faker } from '@faker-js/faker';
import { ListAllUsersAction, type ListAllUsersResponseBody } from './list-all-users.action.js';

describe('ListAllUsersAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const action: ListAllUsersAction = new ListAllUsersAction({
                contextId: faker.string.uuid(),
                login: '',
                password: '',
            });

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('parseBody', () => {
        it('should return ListAllUsersResponse', () => {
            const action: ListAllUsersAction = new ListAllUsersAction({
                contextId: faker.string.uuid(),
                login: '',
                password: '',
            });

            const body: ListAllUsersResponseBody = {
                listAllResponse: {
                    return: [
                        {
                            id: 'id1',
                            email1: 'email1',
                            name: 'username1',
                            primaryEmail: 'email1',
                        },
                        {
                            id: 'id2',
                            email1: 'email2',
                            name: 'username2',
                            primaryEmail: 'email2',
                        },
                    ],
                },
            };
            expect(action.parseBody(body)).toEqual({
                ok: true,
                value: {
                    users: [
                        {
                            id: 'id1',
                            email1: 'email1',
                            name: 'username1',
                            primaryEmail: 'email1',
                        },
                        {
                            id: 'id2',
                            email1: 'email2',
                            name: 'username2',
                            primaryEmail: 'email2',
                        },
                    ],
                },
            });
        });
    });
});
