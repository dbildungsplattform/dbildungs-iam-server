// The redirect saved in Passport is necessary to direct the user
// back to their intended location after a step-up authentication (e.g., admin area).
// This is because Keycloak, when internally forwarding to 2FA, loses the redirect
// information from the query parameters. Thus, it must be forwarded from the original request.
// The session's user passport has been utilized to store this information.
// Both redirect mechanisms are essential: the first one saves the query parameter
// for the redirect in the LoginGuard, and the second ensures that the user is forwarded
// to their desired location after the step-up process.

import { type StepUpLevel } from '../passport/oidc.strategy.js';

declare module 'express-session' {
    interface SessionData {
        redirectUrl?: string;
        requiredStepupLevel?: StepUpLevel;
        lastRouteChangeTime?: number;
        csrfToken?: string;
        passport?: {
            user: {
                redirect_uri?: string;
            };
        };
    }
}

export {};
