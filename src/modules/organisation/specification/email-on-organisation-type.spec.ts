import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { EmailAdressOnOrganisationTyp } from './email-on-organisation-type.js';

describe('EmailAdressOnOrganisationTyp specification', () => {
    const specification: EmailAdressOnOrganisationTyp = new EmailAdressOnOrganisationTyp();

    describe('when organisation is klasse and has email adress', () => {
        it('should return false', async () => {
            const schule: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.KLASSE,
                name: 'test',
                emailAdress: 'testmail@spsh.de',
            });

            await expect(specification.isSatisfiedBy(schule)).resolves.toBe(false);
        });
    });

    describe('when organisation is not klasse and has email adress', () => {
        it('should return true', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                name: 'test',
                emailAdress: 'testmail@spsh.de',
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });
    });

    describe('when no email adress', () => {
        it('should return true always', async () => {
            const organisation: Organisation<false> = DoFactory.createOrganisation(false, {
                typ: OrganisationsTyp.SONSTIGE,
                name: 'test',
            });

            await expect(specification.isSatisfiedBy(organisation)).resolves.toBe(true);
        });
    });
});
