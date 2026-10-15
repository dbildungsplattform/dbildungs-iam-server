import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { NameRequiredForSchule } from './name-required-for-schule.js';

describe('NameRequiredForSchule specification', () => {
    const specification: NameRequiredForSchule = new NameRequiredForSchule();

    describe('when organisation is schule', () => {
        it('should return true, if name is set', async () => {
            const schule: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                name: 'test',
            });

            await expect(specification.isSatisfiedBy(schule)).resolves.toBe(true);
        });

        it('should return false, if name is undefined', async () => {
            const schule: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                name: undefined,
            });

            await expect(specification.isSatisfiedBy(schule)).resolves.toBe(false);
        });

        it('should return false, if name is empty string', async () => {
            const schule: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SCHULE,
                name: '',
            });

            await expect(specification.isSatisfiedBy(schule)).resolves.toBe(false);
        });
    });

    describe('when organisation is not schule', () => {
        it('should return true, if name is set', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                name: 'test',
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });

        it('should return true, if name is undefined', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                name: undefined,
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });

        it('should return true, if name is empty string', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                name: '',
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });
    });
});
