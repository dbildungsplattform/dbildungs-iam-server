import { Test, type TestingModule } from '@nestjs/testing';
import { GlobalValidationPipe } from './global-validation.pipe.js';
import { DetailedValidationError } from './detailed-validation.error.js';

import { CreatedOrganisationDto } from '../../modules/organisation/api/created-organisation.dto.js';
import { type CreateOrganisationBodyParams } from '../../modules/organisation/api/create-organisation.body.params.js';
import { OrganisationsTyp } from '../../modules/organisation/domain/organisation.enums.js';
import { faker } from '@faker-js/faker';

describe('GlobalValidationPipe', () => {
    let module: TestingModule;
    let validationPipe: GlobalValidationPipe;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [GlobalValidationPipe],
        }).compile();
        validationPipe = module.get(GlobalValidationPipe);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(validationPipe).toBeDefined();
    });

    it('should throw DetailedValidation error on failure', () => {
        const organisation: CreateOrganisationBodyParams = {
            name: '',
            typ: OrganisationsTyp.UNBEST,
            administriertVon: faker.string.uuid(),
            zugehoerigZu: faker.string.uuid(),
        };

        return validationPipe
            .transform(organisation, {
                type: 'body',
                metatype: CreatedOrganisationDto,
            })
            .then(() => {
                throw new Error('should have thrown DetailedValidationError');
            })
            .catch((error: Error) => {
                expect(error.name).toBe(DetailedValidationError.name);
            });
    });
});
