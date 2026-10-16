import { type TestingModule, Test } from '@nestjs/testing';
import { OrganisationModule } from './organisation.module.js';
import { OrganisationService } from './domain/organisation.service.js';
import { ConfigTestModule, DatabaseTestModule } from '../../../test/utils/index.js';
import { OrganisationRepository } from './persistence/organisation.repository.js';

describe('OrganisationModule', () => {
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot(), OrganisationModule],
        }).compile();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('when module is initialized', () => {
        it('should resolve OrganisationRepository', () => {
            expect(module.get(OrganisationRepository)).toBeInstanceOf(OrganisationRepository);
        });

        it('should resolve OrganisationService', () => {
            expect(module.get(OrganisationService)).toBeInstanceOf(OrganisationService);
        });
    });
});
