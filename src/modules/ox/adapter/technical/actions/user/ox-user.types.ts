import { type AuthParams } from '../ox-base-action.js';

export type OXUser = {
    id: string;
    email1: string;
    name: string;
    primaryEmail: string;
};

export type UserIdParams = AuthParams & {
    contextId: string;

    userId: string;
};

export type UserNameParams = AuthParams & {
    contextId: string;

    userName: string;
};
