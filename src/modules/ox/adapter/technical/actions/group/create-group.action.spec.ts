import { faker } from '@faker-js/faker';

import { CreateGroupAction, type CreateGroupResponseBody } from './create-group.action.js';

describe('CreateGroupAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const action: CreateGroupAction = new CreateGroupAction({
                contextId: faker.string.uuid(),
                displayname: 'Display Groupname',
                name: 'GroupName',
                login: '',
                password: '',
            });

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('parseBody', () => {
        it('should return CreateGroupResponse', () => {
            const action: CreateGroupAction = new CreateGroupAction({
                contextId: faker.string.uuid(),
                displayname: 'Display Groupname',
                name: 'GroupName',
                login: '',
                password: '',
            });

            const body: CreateGroupResponseBody = {
                createResponse: {
                    return: {
                        id: 'id',
                        displayname: 'group display name',
                        name: 'group name',
                        memberIds: ['userid'],
                    },
                },
            };
            expect(action.parseBody(body)).toEqual({
                ok: true,
                value: {
                    displayname: 'group display name',
                    id: 'id',
                    name: 'group name',
                    memberIds: ['userid'],
                },
            });
        });
    });
});
