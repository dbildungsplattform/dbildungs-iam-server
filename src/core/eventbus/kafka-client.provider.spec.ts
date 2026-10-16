import { vi } from 'vitest';
import { KafkaJS } from '@confluentinc/kafka-javascript';
import { createMock, type DeepMocked } from '../../../test/utils/createMock.js';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { LoggingTestModule } from '../../../test/utils/logging-test.module.js';
import { type KafkaConfig } from '../../shared/config/kafka.config.js';
import { ClassLogger } from '../logging/class-logger.js';
import { KAFKA_INSTANCE, KafkaLogger, KafkaProvider } from './kafka-client-provider.js';

const Kafka: typeof KafkaJS.Kafka = KafkaJS.Kafka;

describe('KafkaLogger', () => {
    let module: TestingModule;
    let sut: KafkaLogger;

    let loggerMock: DeepMocked<ClassLogger>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [KafkaLogger],
        }).compile();

        await module.init();

        sut = module.get(KafkaLogger);
        loggerMock = module.get(ClassLogger);
    });

    describe('info', () => {
        it('should call logger.info', () => {
            const message: string = 'Info Log';

            sut.info(message);

            expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining(message));
        });
    });

    describe('error', () => {
        it('should call logger.error', () => {
            const message: string = 'Error Log';

            sut.error(message);

            expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining(message));
        });
    });

    describe('warn', () => {
        it('should call logger.warn', () => {
            const message: string = 'Warn Log';

            sut.warn(message);

            expect(loggerMock.warning).toHaveBeenCalledWith(expect.stringContaining(message));
        });
    });

    describe('debug', () => {
        it('should call logger.debug', () => {
            const message: string = 'Debug Log';

            sut.debug(message);

            expect(loggerMock.debug).toHaveBeenCalledWith(expect.stringContaining(message));
        });
    });

    describe('additional methods', () => {
        describe('namespace', () => {
            it('should return logger', () => {
                expect(sut.namespace()).toBe(sut);
            });
        });

        describe('setLogLevel', () => {
            it('should not return anything', () => {
                expect(sut.setLogLevel()).toBeUndefined();
            });
        });
    });
});

describe('KafkaProvider', () => {
    let module: TestingModule;
    let configService: DeepMocked<ConfigService>;

    const kafkaConfigEnabled: KafkaConfig = {
        BROKER: 'localhost:9092',
        GROUP_ID: 'test-group',
        SESSION_TIMEOUT: 300000,
        HEARTBEAT_INTERVAL: 3000,
        TOPIC_PREFIX: 'test.',
        USER_TOPIC: 'user-topic',
        USER_DLQ_TOPIC: 'dlq-topic',
        ENABLED: true,
        SSL_ENABLED: false,
        SSL_CA_PATH: undefined,
        SSL_CERT_PATH: undefined,
        SSL_KEY_PATH: undefined,
    };

    const kafkaConfigSslEnabled: KafkaConfig = {
        ...kafkaConfigEnabled,
        ENABLED: true,
        SSL_ENABLED: true,
        SSL_CA_PATH: '/ca.pem',
        SSL_CERT_PATH: '/cert.pem',
        SSL_KEY_PATH: '/key.pem',
    };

    const kafkaConfigDisabled: KafkaConfig = {
        ...kafkaConfigEnabled,
        ENABLED: false,
    };

    afterEach(async () => {
        if (module) {
            await module.close();
        }
        vi.clearAllMocks();
    });

    it('should return Kafka instance when enabled', async () => {
        configService = createMock(ConfigService);
        configService.getOrThrow.mockReturnValue(kafkaConfigEnabled);

        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [{ provide: ConfigService, useValue: configService }, KafkaProvider, KafkaLogger],
        }).compile();

        const kafkaInstance: KafkaJS.Kafka | null = module.get<KafkaJS.Kafka | null>(KAFKA_INSTANCE);

        expect(kafkaInstance).toBeInstanceOf(Kafka);
        expect(configService.getOrThrow).toHaveBeenCalledWith('KAFKA');
    });

    it('should return Kafka instance when enabled', async () => {
        configService = createMock(ConfigService);
        configService.getOrThrow.mockReturnValue(kafkaConfigSslEnabled);

        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [{ provide: ConfigService, useValue: configService }, KafkaProvider, KafkaLogger],
        }).compile();

        const kafkaInstance: KafkaJS.Kafka | null = module.get<KafkaJS.Kafka | null>(KAFKA_INSTANCE);

        expect(kafkaInstance).toBeInstanceOf(Kafka);
        expect(configService.getOrThrow).toHaveBeenCalledWith('KAFKA');
    });

    it('should return null when Kafka is disabled', async () => {
        configService = createMock(ConfigService);
        configService.getOrThrow.mockReturnValue(kafkaConfigDisabled);

        module = await Test.createTestingModule({
            imports: [LoggingTestModule],
            providers: [{ provide: ConfigService, useValue: configService }, KafkaProvider, KafkaLogger],
        }).compile();

        const kafkaInstance: KafkaJS.Kafka | null = module.get<KafkaJS.Kafka | null>(KAFKA_INSTANCE);

        expect(kafkaInstance).toBeNull();
        expect(configService.getOrThrow).toHaveBeenCalledWith('KAFKA');
    });
});
