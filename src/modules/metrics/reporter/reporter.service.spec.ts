import { Test, type TestingModule } from '@nestjs/testing';
import { ReporterService } from './reporter.service.js';
import { MetricsService } from '../service/metrics.service.js';

describe('ReporterService', () => {
    let reporterService: ReporterService;
    let metricsService: MetricsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ReporterService,
                {
                    provide: MetricsService,
                    useValue: {
                        incCounter: vi.fn(),
                        setGauge: vi.fn(),
                    },
                },
            ],
        }).compile();

        reporterService = module.get<ReporterService>(ReporterService);
        metricsService = module.get<MetricsService>(MetricsService);
    });

    it('should be defined', () => {
        expect(reporterService).toBeDefined();
    });

    describe('counter', () => {
        it('should call metricsService.incCounter with correct arguments', () => {
            const key: string = 'test_key';
            const labels: Record<string, string | number> = { label1: 'value1', label2: 42 };

            reporterService.counter(key, labels);

            expect(metricsService.incCounter).toHaveBeenCalledTimes(1);
            expect(metricsService.incCounter).toHaveBeenCalledWith(key, labels);
        });

        it('should call metricsService.incCounter with no labels if labels are not provided', () => {
            const key: string = 'test_key';

            reporterService.counter(key);

            expect(metricsService.incCounter).toHaveBeenCalledTimes(1);
            expect(metricsService.incCounter).toHaveBeenCalledWith(key, undefined);
        });
    });

    describe('gauge', () => {
        it('should call metricsService.setGauge with correct arguments', () => {
            const key: string = 'test_key';
            const value: number = 100;
            const labels: Record<string, string | number> = { label1: 'value1', label2: 42 };

            reporterService.gauge(key, value, labels);

            expect(metricsService.setGauge).toHaveBeenCalledTimes(1);
            expect(metricsService.setGauge).toHaveBeenCalledWith(key, value, labels);
        });

        it('should call metricsService.setGauge with no labels if labels are not provided', () => {
            const key: string = 'test_key';
            const value: number = 100;

            reporterService.gauge(key, value);

            expect(metricsService.setGauge).toHaveBeenCalledTimes(1);
            expect(metricsService.setGauge).toHaveBeenCalledWith(key, value, undefined);
        });
    });
});
