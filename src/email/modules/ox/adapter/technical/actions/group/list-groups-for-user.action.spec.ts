import { faker } from '@faker-js/faker';
import {
    ListGroupsForUserAction,
    ListGroupsForUserResponse,
    ListGroupsForUserResponseBody,
} from './list-groups-for-user.action.js';
import { expectOkResult } from '../../../../../../../../test/utils/test-types.js';

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

    describe('isArrayOverride', () => {
        it('should return true for repeating list elements', () => {
            const action: ListGroupsForUserAction = new ListGroupsForUserAction({
                contextId: faker.string.uuid(),
                userId: faker.string.uuid(),
                login: '',
                password: '',
            });

            const ret: boolean = action.isArrayOverride('', 'Envelope.Body.listGroupsForUserResponse.return');

            expect(ret).toBe(true);
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

        describe('when no groups are part of result', () => {
            it('should return ListGroupsForUserResponse', () => {
                const action: ListGroupsForUserAction = new ListGroupsForUserAction({
                    contextId: faker.string.uuid(),
                    userId: faker.string.uuid(),
                    login: '',
                    password: '',
                });

                const body: ListGroupsForUserResponseBody = {
                    listGroupsForUserResponse: {},
                };

                const result: Result<ListGroupsForUserResponse> = action.parseBody(body);

                expectOkResult(result);
                expect(result.value.groups).toHaveLength(0);
            });
        });
    });
});
