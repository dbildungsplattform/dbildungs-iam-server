import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { KennungRequiredForSchule } from './kennung-required-for-schule.js';

describe('KennungRequiredForSchule specification', () => {
    const specification: KennungRequiredForSchule = new KennungRequiredForSchule();

    describe('when organisation is schule', () => {
        it('should return true, if kennung is set', async () => {
            const schule: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                kennung: 'test',
            });

            await expect(specification.isSatisfiedBy(schule)).resolves.toBe(true);
        });

        it('should return false, if kennung is undefined', async () => {
            const schule: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                kennung: undefined,
            });

            await expect(specification.isSatisfiedBy(schule)).resolves.toBe(false);
        });

        it('should return false, if kennung is empty string', async () => {
            const schule: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                kennung: '',
            });

            await expect(specification.isSatisfiedBy(schule)).resolves.toBe(false);
        });
    });

    describe('when organisation is not schule', () => {
        it('should return true, if kennung is set', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                kennung: 'test',
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });

        it('should return true, if kennung is undefined', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                kennung: undefined,
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });

        it('should return true, if kennung is empty string', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                kennung: '',
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });
    });
});
