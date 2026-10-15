import { Test, type TestingModule } from '@nestjs/testing';
import { StatusController } from './status.controller.js';
import { ConfigTestModule } from '../../../test/utils/index.js';
import { ConfigService } from '@nestjs/config';

describe('StatusController', () => {
    let controller: StatusController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            imports: [ConfigTestModule],
            controllers: [StatusController],
            providers: [
                {
                    provide: ConfigService,
                    useValue: {
                        getOrThrow: vi.fn().mockReturnValue({ STATUS_REDIRECT_URL: 'http://example.com/status' }),
                    },
                },
            ],
        }).compile();

        controller = module.get<StatusController>(StatusController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    it('should return the correct status URL', () => {
        const result: { url: string } = controller.getStatus();
        expect(result).toEqual({ url: 'http://example.com/status' });
    });
});
