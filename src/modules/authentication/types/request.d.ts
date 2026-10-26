import { type PassportUser, type User } from './user.js';

declare global {
    namespace Express {
        interface Request {
            user?: User;
            accessTokenJWT?: string;
            passportUser?: PassportUser;
        }
    }
}

declare module 'express' {
    interface AuthenticatedRequest extends Request {
        user: User;
    }
}

export {};
