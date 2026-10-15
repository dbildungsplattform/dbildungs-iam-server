import { faker } from '@faker-js/faker';
import { ListGroupsForUserAction, type ListGroupsForUserResponseBody } from './list-groups-for-user.action.js';

describe('ListGroupsForUserAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const action: ListGroupsForUserAction = new ListGroupsForUserAction({
                contextId: faker.string.uuid(),
                userId: faker.string.uuid(),
                login: '',
                password: '',
            });

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('parseBody', () => {
        describe('when multiple groups are part of result', () => {
            it('should return ListGroupsForUserResponse', () => {
                const action: ListGroupsForUserAction = new ListGroupsForUserAction({
                    contextId: faker.string.uuid(),
                    userId: faker.string.uuid(),
                    login: '',
                    password: '',
                });

                const body: ListGroupsForUserResponseBody = {
                    listGroupsForUserResponse: {
                        return: [
                            {
                                id: 'id1',
                                displayname: 'display name group 1',
                                name: 'group1',
                                memberIds: ['userId1'],
                            },
                            {
                                id: 'id2',
                                displayname: 'display name group 2',
                                name: 'group2',
                                memberIds: ['userId1'],
                            },
                        ],
                    },
                };
                expect(action.parseBody(body)).toEqual({
                    ok: true,
                    value: {
                        groups: [
                            {
                                id: 'id1',
                                displayname: 'display name group 1',
                                name: 'group1',
                                memberIds: ['userId1'],
                            },
                            {
                                id: 'id2',
                                displayname: 'display name group 2',
                                name: 'group2',
                                memberIds: ['userId1'],
                            },
                        ],
                    },
                });
            });
        });

        describe('when only one group is in result', () => {
            it('should return ListGroupsForUserResponse', () => {
                const action: ListGroupsForUserAction = new ListGroupsForUserAction({
                    contextId: faker.string.uuid(),
                    userId: faker.string.uuid(),
                    login: '',
                    password: '',
                });

                const body: ListGroupsForUserResponseBody = {
                    listGroupsForUserResponse: {
                        return: {
                            id: 'id1',
                            displayname: 'display name group 1',
                            name: 'group1',
                            memberIds: ['userId1'],
                        },
                    },
                };
                expect(action.parseBody(body)).toEqual({
                    ok: true,
                    value: {
                        groups: [
                            {
                                id: 'id1',
                                displayname: 'display name group 1',
                                name: 'group1',
                                memberIds: ['userId1'],
                            },
                        ],
                    },
                });
            });
        });
    });
});
