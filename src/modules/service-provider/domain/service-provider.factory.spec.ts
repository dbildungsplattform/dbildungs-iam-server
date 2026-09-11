import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { expectErrResult, expectOkResult } from '../../../../test/utils/test-types.js';
import { InvalidLogoCombinationError } from './errors/invalid-logo-combination.error.js';
import {
    ServiceProviderKategorie,
    ServiceProviderMerkmal,
    ServiceProviderSystem,
    ServiceProviderTarget,
} from './service-provider.enum.js';
import { ServiceProviderFactory } from './service-provider.factory.js';
import { ServiceProvider } from './service-provider.js';

describe('ServiceProviderFactory', () => {
    let module: TestingModule;
    let sut: ServiceProviderFactory;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [],
            providers: [ServiceProviderFactory],
        }).compile();
        sut = module.get(ServiceProviderFactory);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('construct', () => {
        const example: ServiceProvider<true> = DoFactory.createServiceProvider(true);

        it('should return new instance for valid logo combination', () => {
            const serviceProvider: Result<ServiceProvider<true>, InvalidLogoCombinationError> = sut.construct(
                example.id,
                example.createdAt,
                example.updatedAt,
                example.name,
                example.target,
                example.url,
                example.kategorie,
                example.providedOnSchulstrukturknoten,
                undefined,
                example.logo,
                example.logoMimeType,
                example.keycloakGroup,
                example.keycloakRole,
                example.externalSystem,
                example.requires2fa,
                example.vidisAngebotId,
                example.merkmale,
                example.rollenartenWhitelist,
                example.keycloakClient,
            );
            expectOkResult(serviceProvider);
            expect(serviceProvider.value.rollenartenWhitelist).toEqual(example.rollenartenWhitelist);
        });

        it('should remove dependent merkmale without VERFUEGBAR_FUER_ROLLENERWEITERUNG', () => {
            const serviceProvider: Result<ServiceProvider<true>, InvalidLogoCombinationError> = sut.construct(
                faker.string.uuid(),
                new Date(),
                new Date(),
                faker.company.buzzNoun(),
                ServiceProviderTarget.URL,
                faker.internet.url(),
                ServiceProviderKategorie.EMAIL,
                faker.string.uuid(),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                ServiceProviderSystem.NONE,
                false,
                undefined,
                [
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
                ],
                [],
                undefined,
            );
            expectOkResult(serviceProvider);
            expect(serviceProvider.value.merkmale).toEqual([]);
        });

        it('should return an error for invalid logo combination', () => {
            const serviceProvider: Result<ServiceProvider<true>, InvalidLogoCombinationError> = sut.construct(
                example.id,
                example.createdAt,
                example.updatedAt,
                example.name,
                example.target,
                example.url,
                example.kategorie,
                example.providedOnSchulstrukturknoten,
                faker.number.int({ min: 1, max: 1000 }),
                Buffer.from('fake-logo-data'),
                'image/png',
                example.keycloakGroup,
                example.keycloakRole,
                example.externalSystem,
                example.requires2fa,
                example.vidisAngebotId,
                example.merkmale,
                example.rollenartenWhitelist,
                example.keycloakClient,
            );
            expectErrResult(serviceProvider);
            expect(serviceProvider.error).toBeInstanceOf(InvalidLogoCombinationError);
        });
    });

    describe('createNew', () => {
        const example: ServiceProvider<false> = DoFactory.createServiceProvider(false, {
            id: undefined,
            createdAt: undefined,
            updatedAt: undefined,
        });

        it('should return new instance for valid logo combination', () => {
            const serviceProvider: Result<ServiceProvider<false>, InvalidLogoCombinationError> = sut.createNew(
                example.name,
                example.target,
                example.url,
                example.kategorie,
                example.providedOnSchulstrukturknoten,
                undefined,
                example.logo,
                example.logoMimeType,
                example.keycloakGroup,
                example.keycloakRole,
                example.externalSystem,
                example.requires2fa,
                example.vidisAngebotId,
                example.merkmale,
                example.rollenartenWhitelist,
                example.keycloakClient,
            );
            expectOkResult(serviceProvider);
            expect(serviceProvider.value.rollenartenWhitelist).toEqual(example.rollenartenWhitelist);
        });

        it('should remove dependent merkmale without VERFUEGBAR_FUER_ROLLENERWEITERUNG', () => {
            const serviceProvider: Result<ServiceProvider<false>, InvalidLogoCombinationError> = sut.createNew(
                faker.company.buzzNoun(),
                ServiceProviderTarget.URL,
                faker.internet.url(),
                ServiceProviderKategorie.EMAIL,
                faker.string.uuid(),
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                ServiceProviderSystem.NONE,
                false,
                undefined,
                [
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ROLLENVERWALTUNG,
                ],
                [],
                undefined,
            );
            expectOkResult(serviceProvider);
            expect(serviceProvider.value.merkmale).toEqual([]);
        });

        it('should return an error for invalid logo combination', () => {
            const serviceProvider: Result<ServiceProvider<false>, InvalidLogoCombinationError> = sut.createNew(
                example.name,
                example.target,
                example.url,
                example.kategorie,
                example.providedOnSchulstrukturknoten,
                faker.number.int({ min: 1, max: 1000 }),
                Buffer.from('fake-logo-data'),
                'image/png',
                example.keycloakGroup,
                example.keycloakRole,
                example.externalSystem,
                example.requires2fa,
                example.vidisAngebotId,
                example.merkmale,
                example.rollenartenWhitelist,
                example.keycloakClient,
            );
            expectErrResult(serviceProvider);
            expect(serviceProvider.error).toBeInstanceOf(InvalidLogoCombinationError);
        });
    });
});
