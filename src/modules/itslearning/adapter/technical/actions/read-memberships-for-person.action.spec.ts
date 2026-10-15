import { faker } from '@faker-js/faker';

import { IMSESRoleType } from '../../domain/role.enum.js';
import { type MembershipResponse, ReadMembershipsForPersonAction } from './read-memberships-for-person.action.js';

describe('ReadMembershipsForPersonAction', () => {
    describe('buildRequest', () => {
        it('should return object', () => {
            const action: ReadMembershipsForPersonAction = new ReadMembershipsForPersonAction(faker.string.uuid());

            expect(action.buildRequest()).toBeDefined();
        });
    });

    describe('isArrayOverride', () => {
        it('should return true for tag "membershipIdPair"', () => {
            const action: ReadMembershipsForPersonAction = new ReadMembershipsForPersonAction(faker.string.uuid());

            expect(action.isArrayOverride('membershipIdPair')).toBe(true);
        });
    });

    describe('parseBody', () => {
        it('should return memberships', () => {
            const personId: string = faker.string.uuid();
            const action: ReadMembershipsForPersonAction = new ReadMembershipsForPersonAction(personId);

            const fakeMemberships: MembershipResponse[] = Array.from({ length: 25 }, () => ({
                id: faker.string.uuid(),
                groupId: faker.string.uuid(),
                role: faker.helpers.enumValue(IMSESRoleType),
            }));

            expect(
                action.parseBody({
                    readMembershipsForPersonResponse: {
                        membershipIDPairSet: {
                            membershipIdPair: fakeMemberships.map((m: MembershipResponse) => ({
                                sourcedId: {
                                    identifier: m.id,
                                },
                                membership: {
                                    groupSourcedId: {
                                        identifier: m.groupId,
                                    },
                                    member: {
                                        role: {
                                            roleType: m.role,
                                        },
                                    },
                                },
                            })),
                        },
                    },
                }),
            ).toEqual({
                ok: true,
                value: fakeMemberships,
            });
        });
    });
});
