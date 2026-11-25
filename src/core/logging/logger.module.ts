import { DynamicModule, Module } from '@nestjs/common';
import { ClassLogger } from './class-logger.js';
import { ModuleLogger } from './module-logger.js';
import { NestLogger } from './nest-logger.js';

const MODULE_NAME: string = 'MODULE_NAME';

@Module({
    imports: [],
    providers: [],
    exports: [],
})
export class LoggerModule {
    public static register(moduleName: string): DynamicModule {
        return {
            module: LoggerModule,
            imports: [],
            providers: [
                {
                    provide: MODULE_NAME,
                    useValue: moduleName,
                },
                ModuleLogger,
                ClassLogger,
                NestLogger,
            ],
            exports: [ClassLogger],
            global: false,
        };
    }
}
