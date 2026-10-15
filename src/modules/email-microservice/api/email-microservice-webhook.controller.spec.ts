import { faker } from '@faker-js/faker';
import { Test, type TestingModule } from '@nestjs/testing';

import { EmailConfigTestModule, EventSystemTestModule, LoggingTestModule } from '../../../../test/utils/index.js';
import { type DeepMocked } from '../../../../test/utils/createMock.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { EmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/email-microservice-address-changed.event.js';
import { KafkaEmailMicroserviceAddressChangedEvent } from '../../../shared/events/email-microservice/kafka-email-microservice-address-changed.event.js';
import { EmailWebhookController } from './email-microservice-webhook.controller.js';

describe('EmailWebhookController', () => {
    let sut: EmailWebhookController;
    let eventServiceMock: DeepMocked<EventRoutingLegacyKafkaService>;

    beforeAll(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [LoggingTestModule, EmailConfigTestModule, EventSystemTestModule],
            providers: [EmailWebhookController],
        }).compile();

        sut = module.get(EmailWebhookController);
        eventServiceMock = module.get(EventRoutingLegacyKafkaService);
    });

    describe('POST email-webhook/changed', () => {
        it('should publish event', () => {
            const spshPersonId: string = faker.string.uuid();
            const newPrimaryEmail: string = faker.internet.email();
            const newAlternativeEmail: string = faker.internet.email();
            const previousPrimaryEmail: string = faker.internet.email();
            const previousAlternativeEmail: string = faker.internet.email();

            sut.emailChangedWebhook({
                spshPersonId,
                newPrimaryEmail,
                newAlternativeEmail,
                previousPrimaryEmail,
                previousAlternativeEmail,
            });

            expect(eventServiceMock.publish).toHaveBeenCalledWith(
                expect.any(EmailMicroserviceAddressChangedEvent),
                expect.any(KafkaEmailMicroserviceAddressChangedEvent),
            );
        });
    });
});
