import { type AuthParams } from '../ox-base-action.js';

export type GroupMemberParams = AuthParams & {
    contextId: string;

    groupId: string;

    memberId: string;
};

export type OXGroup = {
    displayname: string;
    id: string;
    name: string;
    memberIds: string[];
};
