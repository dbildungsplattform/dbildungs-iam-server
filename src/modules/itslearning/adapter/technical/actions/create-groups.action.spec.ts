import { faker } from '@faker-js/faker';
import { type CreateGroupParams } from './create-group.params.js';
import { CreateGroupsAction } from './create-groups.action.js';

describe('CreateGroupsAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const schoolName: string = faker.word.adjective();
            const action: CreateGroupsAction = new CreateGroupsAction([
                {
                    id: faker.string.uuid(),
                    name: `${schoolName} school`,
                    parentId: faker.string.uuid(),
                    type: 'School',
                    longDescription: `${schoolName} school (long description)`,
                    fullDescription: `${schoolName} school (full description)`,
                },
            ]);

            expect(action.buildRequest()).toBeDefined();
        });

        it('should return include extension data', () => {
            const params: CreateGroupParams[] = [
                {
                    id: faker.string.uuid(),
                    name: faker.word.noun(),
                    parentId: faker.string.uuid(),
                    type: 'Course',
                },
                {
                    id: faker.string.uuid(),
                    name: faker.word.noun(),
                    parentId: faker.string.uuid(),
                    type: 'Unspecified',
                },
            ];
            const action: CreateGroupsAction = new CreateGroupsAction(params);

            expect(action.buildRequest()).toMatchObject({
                'ims:createGroupsRequest': {
                    'ims:groupIdPairSet': {
                        'ims:groupIdPair': [
                            {
                                'ims:group': {
                                    'ims2:extension': {
                                        'ims1:extensionField': [
                                            {
                                                'ims1:fieldName': 'course',
                                                'ims1:fieldType': 'String',
                                                'ims1:fieldValue': params[0]?.name,
                                            },
                                            {
                                                'ims1:fieldName': 'course/code',
                                                'ims1:fieldType': 'String',
                                                'ims1:fieldValue': params[0]?.name,
                                            },
                                        ],
                                    },
                                },
                            },
                            {
                                'ims:group': {
                                    'ims2:extension': undefined,
                                },
                            },
                        ],
                    },
                },
            });
        });
    });

    describe('parseBody', () => {
        it('should void result', () => {
            const action: CreateGroupsAction = new CreateGroupsAction([
                {
                    id: faker.string.uuid(),
                    name: `${faker.word.adjective()} school`,
                    parentId: faker.string.uuid(),
                    type: 'School',
                },
            ]);

            expect(action.parseBody()).toEqual({
                ok: true,
                value: undefined,
            });
        });
    });
});
