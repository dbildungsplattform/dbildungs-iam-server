export type InitSoftwareToken = {
    detail: {
        googleurl: {
            description: string;
            img: string;
            value: string;
        };
        oathurl: {
            description: string;
            img: string;
            value: string;
        };
        otpkey: {
            description: string;
            img: string;
            value: string;
            value_b32: string;
        };
        rollout_state: string;
        serial: string;
        threadid: number;
    };
};

export type InitSoftwareTokenPayload = {
    genkey: number;
    keysize: number;
    description: string;
    user: string;
    type: string;
    otplen: number;
    hashlib: string;
    '2stepinit': number;
    otpkeyformat: string;
    rollover: number;
};

type PrivacyIdeaTokenInfo = {
    hashlib: string;
    timeShift: string;
    timeStep: string;
    timeWindow: string;
    tokenkind: string;
};
export type PrivacyIdeaToken = {
    active: boolean;
    count: number;
    count_window: number;
    description: string;
    failcount: number;
    id: number;
    info: PrivacyIdeaTokenInfo;
    locked: boolean;
    maxfail: number;
    otplen: number;
    realms: string[];
    resolver: string;
    revoked: boolean;
    rollout_state: string;
    serial: string;
    sync_window: number;
    tokengroup: string[];
    tokentype: string;
    user_editable: boolean;
    user_id: string;
    user_realm: string;
    username: string;
};

export type PrivacyIdeaResponseTokens = {
    id: number;
    jsonrpc: string;
    result: {
        status: boolean;
        value: {
            count: number;
            current: number;
            next: string | null;
            prev: string | null;
            tokens: PrivacyIdeaToken[];
        };
    };
    time: number;
    version: string;
    versionnumber: string;
    signature: string;
};

export type AuthenticationResponse = {
    id: number;
    jsonrpc: string;
    result: {
        status: boolean;
        value: {
            log_level: number;
            menus: string[];
            realm: string;
            rights: string[];
            role: string;
            token: string;
            username: string;
            logout_time: number;
            audit_page_size: number;
            token_page_size: number;
            user_page_size: number;
            policy_template_url: string;
            default_tokentype: string;
            user_details: boolean;
            token_wizard: boolean;
            token_wizard_2nd: boolean;
            admin_dashboard: boolean;
            dialog_no_token: boolean;
            search_on_enter: boolean;
            timeout_action: string;
            token_rollover: Record<string, unknown>;
            hide_welcome: boolean;
            hide_buttons: boolean;
            deletion_confirmation: boolean;
            show_seed: boolean;
            show_node: string;
            subscription_status: number;
            subscription_status_push: number;
            qr_image_android: string | null;
            qr_image_ios: string | null;
            qr_image_custom: string | null;
            logout_redirect_url: string;
            require_description: string[];
        };
    };
    time: number;
    version: string;
    versionnumber: string;
    signature: string;
};

export type User = {
    description: string;
    editable: boolean;
    email: string;
    givenname: string;
    mobile: string;
    phone: string;
    resolver: string;
    surname: string;
    userid: string;
    username: string;
};

export type UserResponse = {
    id: number;
    jsonrpc: string;
    result: {
        status: boolean;
        value: User[];
    };
    time: number;
    version: string;
    versionnumber: string;
    signature: string;
};

export type ResetTokenResponse = {
    id: number;
    jsonrpc: string;
    result: {
        status: boolean;
        value: number;
    };
    time: number;
    version: string;
    versionNumber: string;
    signature: string;
};

export type ResetTokenPayload = {
    serial: string;
};

export type TokenOTPSerialResponse = {
    id: number;
    jsonrpc: string;
    result: {
        status: boolean;
        value: {
            count: number;
            serial: string | null;
        };
    };
    time: number;
    version: string;
    versionnumber: string;
    signature: string;
};

export type AssignTokenPayload = {
    serial: string;
    user: string;
    realm: string;
};

export type TokenVerificationResponse = {
    id: number;
    jsonrpc: string;
    result: {
        status: boolean;
        value: {
            count: number;
            current: number;
            next: number | null;
            prev: number | null;
            tokens: {
                active: boolean;
                count: number;
                count_window: number;
                description: string;
                failcount: number;
                id: number;
                info: {
                    hashlib: string;
                    timeShift: string;
                    timeStep: string;
                    timeWindow: string;
                    tokenkind: string;
                };
                locked: boolean;
                maxfail: number;
                otplen: number;
                realms: string[];
                resolver: string;
                revoked: boolean;
                rollout_state: string;
                serial: string;
                sync_window: number;
                tokengroup: string[];
                tokentype: string;
                user_id: string;
                user_realm: string;
                username: string;
            }[];
        };
    };
    time: number;
    version: string;
    versionnumber: string;
    signature: string;
};

export type AssignTokenResponse = {
    id: number;
    jsonrpc: string;
    result: {
        status: boolean;
        value: boolean;
    };
    time: number;
    version: string;
    versionnumber: string;
    signature: string;
};

export type VerificationResponse = {
    detail: Detail | null;
    id: number;
    jsonrpc: string;
    result: Result;
    time: number;
    version: string;
    versionnumber?: string;
    signature: string;
};

type Detail = {
    rollout_state: string;
    serial: string;
    threadid: number;
};

type Result = {
    status: boolean;
    value?: boolean;
    error?: ErrorDetail;
};

type ErrorDetail = {
    code: number;
    message: string;
};
