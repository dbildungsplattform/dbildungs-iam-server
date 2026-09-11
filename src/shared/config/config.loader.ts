import fs from 'fs';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { JsonConfig } from './json.config.js';
import { merge } from 'lodash-es';
import EnvConfig from './config.env.js';
import { getEmailConfig } from './email-config.env.js';
import { EmailAppConfig } from './email-app.config.js';
import { ConfigLoaderValidationError } from './errors/config-loader-validation.error.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFileToJSON(path: string): any {
    const file: string = fs.readFileSync(path, { encoding: 'utf8' });
    return JSON.parse(file);
}

export function loadConfigFiles(): JsonConfig {
    const secretFilePath: string = './config/secrets.json';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment
    const json: any = parseFileToJSON('./config/config.json');
    let secrets: unknown;
    if (fs.existsSync(secretFilePath)) {
        secrets = parseFileToJSON(secretFilePath);
    } else {
        secrets = null;
    }
    // Environmental override
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = EnvConfig();

    let merged: unknown;
    if (secrets != null) {
        merged = merge(json, secrets, env);
    } else {
        merged = merge(json, env);
    }

    const mergedConfig: JsonConfig = plainToInstance(JsonConfig, merged, { enableImplicitConversion: false });
    const errors: ValidationError[] = validateSync(mergedConfig, {
        skipMissingProperties: false,
        whitelist: true,
        forbidUnknownValues: true,
    });
    if (errors.length !== 0) {
        throw new ConfigLoaderValidationError(errors);
    }
    return mergedConfig;
}

export function loadEmailAppConfigFiles(): EmailAppConfig {
    const secretFilePath: string = './config/email-secrets.json';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment
    const json: any = parseFileToJSON('./config/email-config.json');
    let secrets: unknown;
    if (fs.existsSync(secretFilePath)) {
        secrets = parseFileToJSON(secretFilePath);
    } else {
        secrets = null;
    }
    // Environmental override
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: any = getEmailConfig();
    let merged: unknown;
    if (secrets != null) {
        merged = merge(json, secrets, env);
    } else {
        merged = merge(json, env);
    }

    const mergedConfig: EmailAppConfig = plainToInstance(EmailAppConfig, merged, { enableImplicitConversion: false });

    const errors: ValidationError[] = validateSync(mergedConfig, {
        skipMissingProperties: false,
        whitelist: true,
        forbidUnknownValues: true,
    });
    if (errors.length !== 0) {
        throw new ConfigLoaderValidationError(errors);
    }
    return mergedConfig;
}
