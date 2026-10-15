import { Test, type TestingModule } from '@nestjs/testing';

import { DbConfig } from './db.config.js';
import { EmailAppConfig } from './email-app.config.js';
import { EmailConfigModule } from './email-config.module.js';
import { LoggingConfig } from './logging.config.js';

describe('EmailConfigModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [EmailConfigModule],
        }).compile();
    });

    afterAll(async () => {
        await module?.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    it('should export EmailAppConfig', () => {
        expect(module.get(EmailAppConfig)).toBeDefined();
    });

    it('should export LoggingConfig', () => {
        expect(module.get(LoggingConfig)).toBeDefined();
    });

    it('should export DbConfig', () => {
        expect(module.get(DbConfig)).toBeDefined();
    });
});
