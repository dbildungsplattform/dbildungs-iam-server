/* eslint-disable max-classes-per-file */
import type * as PromClient from 'prom-client';
import { vi } from 'vitest';

type OriginalType = typeof PromClient;
vi.mock<OriginalType>(import('prom-client'), async (importOriginal: () => Promise<OriginalType>) => {
    const originalModule: OriginalType = await importOriginal();

    return {
        ...originalModule,
        Counter: class {
            public inc: () => void = vi.fn();
        } as unknown as OriginalType['Counter'],
        Gauge: class {
            public set: () => void = vi.fn();
        } as unknown as OriginalType['Gauge'],
    };
});

import { Test, type TestingModule } from '@nestjs/testing';
import { type Counter, type Gauge, Registry } from 'prom-client';
import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
    let service: MetricsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MetricsService,
                {
                    provide: Registry,
                    useValue: new Registry(),
                },
            ],
        }).compile();

        service = module.get<MetricsService>(MetricsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('incCounter', () => {
        it('should create and increment a counter without labels', () => {
            const key: string = 'test_counter';

            service.incCounter(key);

            const counterInstance: Counter<string> | undefined = service['counter'][key];
            expect(counterInstance).toBeDefined();

            expect(counterInstance?.inc).toHaveBeenCalledWith({});
        });

        it('should create and increment a counter with labels', () => {
            const key: string = 'test_counter_labels';
            const labels: Record<string, string | number> = { method: 'GET', path: '/api/test' };

            service.incCounter(key, labels);

            const counterInstance: Counter<string> | undefined = service['counter'][key];
            expect(counterInstance).toBeDefined();

            expect(counterInstance?.inc).toHaveBeenCalledWith(labels);
        });

        it('should increment the counter multiple times', () => {
            const key: string = 'test_counter_multiple';

            service.incCounter(key);
            service.incCounter(key);
            service.incCounter(key);
            const counterInstance: Counter<string> | undefined = service['counter'][key];

            expect(counterInstance?.inc).toHaveBeenCalledTimes(3);
        });
    });

    describe('setGauge', () => {
        it('should create and set a gauge without labels', () => {
            const key: string = 'test_gauge';
            const value: number = 42;

            service.setGauge(key, value);

            const gaugeInstance: Gauge<string> | undefined = service['gauge'][key];
            expect(gaugeInstance).toBeDefined();

            expect(gaugeInstance?.set).toHaveBeenCalledWith({}, value);
        });

        it('should create and set a gauge with labels', () => {
            const key: string = 'test_gauge_labels';
            const value: number = 100;
            const labels: Record<string, string | number> = { status: 'success' };

            service.setGauge(key, value, labels);

            const gaugeInstance: Gauge<string> | undefined = service['gauge'][key];
            expect(gaugeInstance).toBeDefined();

            expect(gaugeInstance?.set).toHaveBeenCalledWith(labels, value);
        });

        it('should overwrite the gauge value when set multiple times', () => {
            const key: string = 'test_gauge_overwrite';
            const value1: number = 10;
            const value2: number = 20;

            service.setGauge(key, value1);
            service.setGauge(key, value2);
            const gaugeInstance: Gauge<string> | undefined = service['gauge'][key];

            expect(gaugeInstance?.set).toHaveBeenCalledTimes(2);
            expect(gaugeInstance?.set).toHaveBeenNthCalledWith(1, {}, value1);
            expect(gaugeInstance?.set).toHaveBeenNthCalledWith(2, {}, value2);
        });
    });
});
