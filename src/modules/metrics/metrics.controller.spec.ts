import { Test, type TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller.js';
import { Registry } from 'prom-client';
import { DBiamPersonenkontextRepo } from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { ReporterService } from './reporter/reporter.service.js';

describe('MetricsController', () => {
    let controller: MetricsController;
    let registry: Registry;
    let reporterService: ReporterService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [MetricsController],
            providers: [
                {
                    provide: Registry,
                    useValue: {
                        metrics: vi.fn().mockResolvedValue('metrics result'),
                        registerMetric: vi.fn(),
                    },
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: {
                        getPersonenkontextRollenCount: vi.fn().mockResolvedValue([
                            { rollenart: 'LERN', count: '5' },
                            { rollenart: 'LEIT', count: '8' },
                            { rollenart: 'LEHR', count: '10' },
                        ]),
                    },
                },
                {
                    provide: ReporterService,
                    useValue: {
                        gauge: vi.fn(),
                    },
                },
            ],
        }).compile();

        controller = module.get<MetricsController>(MetricsController);
        registry = module.get<Registry>(Registry);
        reporterService = module.get<ReporterService>(ReporterService);
    });

    it('should return metrics', async () => {
        const result: string = await controller.getMetrics();
        expect(result).toBe('metrics result');
        expect(registry.metrics).toHaveBeenCalled();
    });

    it('should call gauge with correct metrics and count', async () => {
        await controller.getMetrics();
        expect(reporterService.gauge).toHaveBeenCalledWith('personenkontext_rollen_count', 5, { rollenart: 'LERN' });
        expect(reporterService.gauge).toHaveBeenCalledWith('personenkontext_rollen_count', 8, { rollenart: 'LEIT' });
        expect(reporterService.gauge).toHaveBeenCalledWith('personenkontext_rollen_count', 10, { rollenart: 'LEHR' });
    });
});
