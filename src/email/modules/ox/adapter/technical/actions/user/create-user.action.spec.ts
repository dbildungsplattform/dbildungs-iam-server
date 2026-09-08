import { faker } from '@faker-js/faker';

import { CreateUserAction, CreateUserResponseBody } from './create-user.action.js';

describe('CreateUserAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const username: string = faker.internet.username();
            const firstname: string = faker.person.firstName();
            const lastname: string = faker.person.lastName();
            const email: string = firstname + '.' + lastname + '@test.de';

            const action: CreateUserAction = new CreateUserAction({
                contextId: faker.string.uuid(),
                displayName: firstname,
                email1: email,
                username: username,
                mailEnabled: true,
                firstname: firstname,
                lastname: lastname,
                primaryEmail: email,
                userPassword: 'Test',
                login: '',
                password: '',
            });

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('parseBody', () => {
        it('should return CreateUserResponse', () => {
            const username: string = faker.internet.username();
            const firstname: string = faker.person.firstName();
            const lastname: string = faker.person.lastName();
            const email: string = firstname + '.' + lastname + '@test.de';

            const action: CreateUserAction = new CreateUserAction({
                contextId: faker.string.uuid(),
                displayName: firstname,
                email1: email,
                username: username,
                mailEnabled: true,
                firstname: firstname,
                lastname: lastname,
                primaryEmail: email,
                userPassword: 'Test',
                login: '',
                password: '',
            });

            const body: CreateUserResponseBody = {
                createByModuleAccessResponse: {
                    return: {
                        aliases: [],
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
});
