import { faker } from '@faker-js/faker';
import { DoFactory } from '../../../../test/utils/index.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { InvalidLogoCombinationError } from './errors/invalid-logo-combination.error.js';
import { ServiceProviderKategorie, ServiceProviderMerkmal } from './service-provider.enum.js';
import { ServiceProvider, ServiceProviderUpdateParams } from './service-provider.js';

type ValidLogoCombinationTestCase =
    | { logoId: number; logo: undefined; logoMimeType: undefined }
    | {
          logoId: undefined;
          logo: Buffer;
          logoMimeType: string;
      }
    | {
          logoId: undefined;
          logo: undefined;
          logoMimeType: undefined;
      };
interface InvalidLogoCombinationTestCase {
    description: string;
    logoId?: number;
    logo?: Buffer;
    logoMimeType?: string;
}

const validLogoCombinations: ValidLogoCombinationTestCase[] = [
    { logoId: undefined, logo: Buffer.from('fake-logo-data'), logoMimeType: 'image/png' },
    { logoId: faker.number.int({ min: 1, max: 1000 }), logo: undefined, logoMimeType: undefined },
    {
        logoId: undefined,
        logo: undefined,
        logoMimeType: undefined,
    },
];

const invalidLogoCombinations: InvalidLogoCombinationTestCase[] = [
    {
        description: 'only logoMimeType is provided',
        logoId: undefined,
        logo: undefined,
        logoMimeType: 'image/png',
    },
    {
        description: 'only logo is provided',
        logoId: undefined,
        logo: Buffer.from('fake-logo-data'),
        logoMimeType: undefined,
    },
    {
        description: 'logoMimeType and logoId are provided',
        logoId: faker.number.int({ min: 1, max: 1000 }),
        logo: undefined,
        logoMimeType: 'image/png',
    },
    {
        description: 'logo and logoId are provided',
        logoId: faker.number.int({ min: 1, max: 1000 }),
        logo: Buffer.from('fake-logo-data'),
        logoMimeType: undefined,
    },
    {
        description: 'logo, logoMimeType and logoId are provided',
        logoId: faker.number.int({ min: 1, max: 1000 }),
        logo: Buffer.from('fake-logo-data'),
        logoMimeType: 'image/png',
    },
];

describe('ServiceProvider', () => {
    describe('isValidLogoCombination', () => {
        it.each(validLogoCombinations)(
            'should return true for valid combination',
            (validLogoCombination: ValidLogoCombinationTestCase) => {
                const result: boolean = ServiceProvider.isValidLogoCombination(
                    validLogoCombination.logoId,
                    validLogoCombination.logo,
                    validLogoCombination.logoMimeType,
                );
                expect(result).toBe(true);
            },
        );

        it.each(invalidLogoCombinations)(
            'should return false if $description',
            ({ logoId, logo, logoMimeType }: InvalidLogoCombinationTestCase) => {
                const result: boolean = ServiceProvider.isValidLogoCombination(logoId, logo, logoMimeType);
                expect(result).toBe(false);
            },
        );
    });

    describe('update', () => {
        it.each([
            [
                {
                    name: faker.company.buzzNoun(),
                    url: faker.internet.url(),
                    logoId: faker.number.int({ min: 1, max: 1000 }),
                },
            ],
            [{ logoId: 1 }],
        ])('should update safe fields and return undefined', (update: ServiceProviderUpdateParams) => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                kategorie: ServiceProviderKategorie.HINWEISE,
                logo: undefined,
                logoMimeType: undefined,
            });
            const result: Option<InvalidLogoCombinationError> = serviceProvider.update(update);
            expect(result).toBeUndefined();
            expect(serviceProvider).toEqual({ ...serviceProvider, ...update });
        });

        it('should update unsafe fields', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                kategorie: ServiceProviderKategorie.HINWEISE,
                merkmale: [],
                rollenartenWhitelist: [],
                logo: undefined,
                logoMimeType: undefined,
            });
            const update: ServiceProviderUpdateParams = {
                kategorie: ServiceProviderKategorie.EMAIL,
                merkmale: [ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG],
                rollenartenWhitelist: [RollenArt.LEHR],
            };
            const result: Option<InvalidLogoCombinationError> = serviceProvider.update(update);
            expect(result).toBeUndefined();
            expect(serviceProvider.kategorie).toBe(ServiceProviderKategorie.EMAIL);
            expect(serviceProvider.merkmale).toEqual([]);
            expect(serviceProvider.rollenartenWhitelist).toEqual([RollenArt.LEHR]);
        });

        it('should update all fields at once', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                kategorie: ServiceProviderKategorie.HINWEISE,
                merkmale: [],
                rollenartenWhitelist: [],
                logo: undefined,
                logoMimeType: undefined,
            });
            const update: ServiceProviderUpdateParams = {
                name: faker.company.buzzNoun(),
                url: faker.internet.url(),
                logoId: faker.number.int({ min: 1, max: 1000 }),
                kategorie: ServiceProviderKategorie.EMAIL,
                merkmale: [ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG],
                rollenartenWhitelist: [RollenArt.LEHR],
            };
            const result: Option<InvalidLogoCombinationError> = serviceProvider.update(update);
            expect(result).toBeUndefined();
            expect(serviceProvider.name).toBe(update.name);
            expect(serviceProvider.url).toBe(update.url);
            expect(serviceProvider.logoId).toBe(update.logoId);
            expect(serviceProvider.kategorie).toBe(ServiceProviderKategorie.EMAIL);
            expect(serviceProvider.merkmale).toEqual([]);
            expect(serviceProvider.rollenartenWhitelist).toEqual([RollenArt.LEHR]);
        });

        it('should keep ANBIETEN merkmale when VERFUEGBAR_FUER_ROLLENERWEITERUNG is also set', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                merkmale: [],
                logo: undefined,
                logoMimeType: undefined,
            });

            const result: Option<InvalidLogoCombinationError> = serviceProvider.update({
                merkmale: [
                    ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                    ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
                ],
            });

            expect(result).toBeUndefined();
            expect(serviceProvider.merkmale).toEqual([
                ServiceProviderMerkmal.VERFUEGBAR_FUER_ROLLENERWEITERUNG,
                ServiceProviderMerkmal.ANBIETEN_IN_SCHULISCHER_ANGEBOTSVERWALTUNG,
            ]);
        });

        it('should set logoId to undefined if null is provided', () => {
            const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true, {
                logo: undefined,
                logoMimeType: undefined,
                logoId: 123,
            });
            const result: Option<InvalidLogoCombinationError> = serviceProvider.update({ logoId: null });
            expect(result).toBeUndefined();
            expect(serviceProvider.logoId).toBeUndefined();
        });

        it.each([[1], [123]])(
            'should return an error if logoId=%s is provided when logo is already set',
            (logoId: number) => {
                const serviceProvider: ServiceProvider<true> = DoFactory.createServiceProvider(true);
                const result: Option<InvalidLogoCombinationError> = serviceProvider.update({ logoId });
                expect(result).toBeInstanceOf(InvalidLogoCombinationError);
                expect(serviceProvider.logoId).toBeUndefined();
            },
        );
    });
});
