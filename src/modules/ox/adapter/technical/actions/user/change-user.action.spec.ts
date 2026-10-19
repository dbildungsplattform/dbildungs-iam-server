import { faker } from '@faker-js/faker';

import { ChangeUserAction } from './change-user.action.js';
import { type OXUserID } from '../../../../../../shared/types/ox-ids.types.js';

describe('ChangeUserAction', () => {
    let username: string;
    let oxUserId: OXUserID;
    let firstname: string;
    let lastname: string;
    let email: string;

    beforeEach(() => {
        username = faker.internet.username();
        oxUserId = faker.string.uuid();
        firstname = faker.person.firstName();
        lastname = faker.person.lastName();
        email = firstname + '.' + lastname + '@schule-sh.de';
    });

    describe('buildRequest', () => {
        it('should return object', () => {
            const action: ChangeUserAction = new ChangeUserAction({
                contextId: faker.string.uuid(),
                contextName: faker.string.alpha(),
                userId: oxUserId,
                email1: email,
                defaultSenderAddress: email,
                aliases: [email],
                username: username,
                givenname: firstname,
                surname: lastname,
                displayname: username,
                primaryEmail: email,
                login: '',
                password: '',
            });

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('parseBody', () => {
        it('should return CreateUserResponse', () => {
            const action: ChangeUserAction = new ChangeUserAction({
                contextId: faker.string.uuid(),
                contextName: faker.string.alpha(),
                userId: oxUserId,
                email1: email,
                defaultSenderAddress: email,
                aliases: [email],
                username: username,
                givenname: firstname,
                surname: lastname,
                displayname: username,
                primaryEmail: email,
                login: '',
                password: '',
            });

            expect(action.parseBody()).toEqual({
                ok: true,
                value: undefined,
            });
        });
    });
});
