/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { NestLogger } from '../core/logging/nest-logger.js';
import { GlobalValidationPipe } from '../shared/validation/index.js';
import { GlobalPagingHeadersInterceptor } from '../shared/paging/index.js';
import { VersioningType } from '@nestjs/common';
import { EmailModule } from './email.module.js';
import { EmailAppConfig } from '../shared/config/email-app.config.js';

async function bootstrap(): Promise<void> {
    const app: NestExpressApplication = await NestFactory.create<NestExpressApplication>(EmailModule);
    const config: EmailAppConfig = app.get(EmailAppConfig);
    const port: number = config.HOST.PORT;

    // Starts listening for shutdown hooks
    app.enableShutdownHooks();

    app.enableVersioning({
        type: VersioningType.URI,
    });

    const swagger: Omit<OpenAPIObject, 'paths'> = new DocumentBuilder()
        .setTitle('Email')
        .setDescription('The Email API description')
        .setVersion('1.0')
        .build();

    app.useLogger(app.get(NestLogger));
    app.useGlobalInterceptors(new GlobalPagingHeadersInterceptor());
    app.useGlobalPipes(new GlobalValidationPipe());
    app.setGlobalPrefix('api', {
        exclude: ['health', 'metrics'],
    });

    console.log('Envi: ' + process.env['DEPLOY_STAGE']);
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), {
        swaggerOptions: {
            persistAuthorization: false,
        },
    });

    await app.listen(port);

    console.info(`\nListening on: http://127.0.0.1:${port}`);
    console.info(`API documentation can be found on: http://127.0.0.1:${port}/docs`);
}

bootstrap().catch((error: unknown) => console.error('Failed to start server with error:', error));
