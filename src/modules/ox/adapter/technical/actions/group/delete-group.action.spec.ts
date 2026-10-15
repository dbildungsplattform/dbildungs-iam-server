import { faker } from '@faker-js/faker';
import { DeleteGroupAction, type DeleteGroupParams, type DeleteGroupResponseBody } from './delete-group.action.js';
import { Ok } from '../../../../../../shared/util/result.js';

describe('DeleteGroupAction', () => {
    let params: DeleteGroupParams;
    let action: DeleteGroupAction;
    beforeEach(() => {
        params = {
            contextId: faker.string.numeric(),
            id: faker.string.numeric(),
            login: '',
            password: '',
        };
        action = new DeleteGroupAction(params);
    });

    describe('buildRequest', () => {
        it('should return request object', () => {
            const request: object = action.buildRequest();
            expect(request).toEqual({
                /* eslint-disable @typescript-eslint/no-unsafe-assignment */
                'tns:delete': expect.objectContaining({
                    'tns:ctx': {
                        'ns6:id': params.contextId,
                    },
                    'tns:grp': {
                        'ns6:id': params.id,
                    },
                    'tns:auth': {
                        'ns2:login': params.login,
                        'ns2:password': params.password,
                    },
                }),
            });
        });
    });

    describe('parseBody', () => {
        it('should return result', () => {
            const body: DeleteGroupResponseBody = {};
            expect(action.parseBody(body)).toEqual(Ok({}));
        });
    });
});
