import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

try {
    readFileSync(resolve(__dirname, './.env'), 'utf-8')
        .split('\n')
        .forEach((line: string) => {
            const [key, value]: string[] = line.split('=');
            if (key === 'CI' && value?.toLowerCase() === 'true') {
                process.env[key] = 'true';
            }
        });
} catch {}

export default defineConfig({
    oxc: {
        decorator: {
            legacy: true,
            emitDecoratorMetadata: true,
        },
    },
    test: {
        globals: true,
        environment: 'node',
        hookTimeout: 60000, // 1 minute for setup/teardown
        testTimeout: 30000, // 30 seconds default timeout
        onConsoleLog: process.env['CI'] ? () => false : undefined, // Suppress console logs in CI environment
        coverage: {
            provider: 'v8',
            reporter: [['text', { maxCols: 150 }], 'lcov'],
            // To find coverage gaps locally the html reporter is useful
            // reporter: [['text', { maxCols: 150 }], 'html', 'lcov'],
            reportsDirectory: 'coverage',
            reportOnFailure: true,
            include: ['src/**/*.ts'],
            exclude: [
                '**/main.ts',
                '**/index.ts',
                '**/*.module.ts',
                '**/*.spec.ts',
                '**/*.integration-spec.ts',
                '**/test/**',
                '**/*.d.ts',
                '**/*.types.ts',
                'vite.config.ts',
            ],
            thresholds: {
                statements: 100,
                branches: -85, // Absolute count to avoid regressions
                functions: 100,
                lines: 100,
                autoUpdate: true, // automatically update coverage to stay up to date
            },
            skipFull: true,
        },
        projects: [
            {
                test: {
                    name: 'unit',
                    include: ['**/*.spec.ts'],
                    maxWorkers: '90%',
                    hookTimeout: 20000, // 20 seconds for setup/teardown
                    testTimeout: 20000, // 20 seconds for unit tests
                    sequence: {
                        groupOrder: 0,
                    },
                },
                extends: true,
            },
            {
                test: {
                    name: 'integration',
                    include: ['**/*.integration-spec.ts'],
                    maxWorkers: '50%', // limit the workers to leave CPU threads for test containers
                    hookTimeout: 300000, // 5 minutes for setup/teardown
                    testTimeout: 90000, // 1.5 minutes for integration tests
                    // Scoped to this project only: a root-level globalSetup also runs for a phantom no-file context, tearing the shared container down early.
                    globalSetup: './test/vitest.global-setup.ts',
                    sequence: {
                        groupOrder: 1,
                    },
                },
                extends: true,
            },
        ],
    },
    resolve: {
        alias: {
            src: resolve(__dirname, './src'),
        },
    },
});
