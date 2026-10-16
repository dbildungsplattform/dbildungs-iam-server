/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { KcDbMicroserviceModule } from './kc-db-microservice.module.js';
import { type INestApplication } from '@nestjs/common';

async function bootstrap(): Promise<void> {
    const app: INestApplication = await NestFactory.create(KcDbMicroserviceModule);
    await app.listen(process.env['KC_DB_PORT'] ?? 3000);
}

bootstrap().catch((error: unknown) => console.error('Failed to start microservice with error:', error));
