import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { KlassenNameAnSchuleEindeutig } from './klassen-name-an-schule-eindeutig.js';

describe('KlassenNameAnSchuleEindeutig', () => {
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let sut: KlassenNameAnSchuleEindeutig;

    beforeEach(() => {
        organisationRepoMock = createMock(OrganisationRepository);
        sut = new KlassenNameAnSchuleEindeutig(organisationRepoMock);
    });

    it('should be satisfied if organisation is not a Klasse', async () => {
        const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });

        await expect(sut.isSatisfiedBy(schule)).resolves.toBe(true);
    });

    it('should not be satisfied if Klasse has no parent', async () => {
        const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.KLASSE,
            administriertVon: undefined,
        });

        await expect(sut.isSatisfiedBy(klasse)).resolves.toBe(false);
    });

    it('should not be satisfied if the parent cannot be found', async () => {
        const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.KLASSE,
            administriertVon: faker.string.uuid(),
        });
        organisationRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(klasse)).resolves.toBe(false);
    });

    it('should not be satisfied if another Klasse has the same name', async () => {
        const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.KLASSE,
            administriertVon: faker.string.uuid(),
        });
        const parent: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
        const sibling: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.KLASSE,
            name: klasse.name,
        });
        organisationRepoMock.findById.mockResolvedValueOnce(parent);
        organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([sibling]);

        await expect(sut.isSatisfiedBy(klasse)).resolves.toBe(false);
    });

    it('should be satisfied if other Klassen have different names', async () => {
        const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.KLASSE,
            name: '1a',
            administriertVon: faker.string.uuid(),
        });
        const parent: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
        const sibling: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.KLASSE,
            name: '1b',
        });
        const nonKlasse: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
            name: '1a',
        });
        organisationRepoMock.findById.mockResolvedValueOnce(parent);
        organisationRepoMock.findChildOrgasForIds.mockResolvedValueOnce([sibling, nonKlasse]);

        await expect(sut.isSatisfiedBy(klasse)).resolves.toBe(true);
    });
});
