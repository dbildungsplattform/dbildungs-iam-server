import { faker } from '@faker-js/faker';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { BehoerdeAdministriertVon } from './behoerde-administriert-von.js';

describe('BehoerdeAdministriertVon Specification', () => {
    let sut: BehoerdeAdministriertVon;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new BehoerdeAdministriertVon(orgaRepoMock);
    });

    it('should ignore organisations when typ is not BEHOERDE', async () => {
        const nonBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
        });

        await expect(sut.isSatisfiedBy(nonBehoerde)).resolves.toBe(true);
    });

    it('should return false, if administriertVon is not set', async () => {
        const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.BEHOERDE,
            administriertVon: undefined,
        });

        await expect(sut.isSatisfiedBy(behoerde)).resolves.toBe(false);
    });

    it('should return false, if administriertVon parent does not exist', async () => {
        const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.BEHOERDE,
            administriertVon: faker.string.uuid(),
        });
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(behoerde)).resolves.toBe(false);
    });

    it.each<OrganisationsTyp>([OrganisationsTyp.BEHOERDE, OrganisationsTyp.LAND])(
        'should return true, if administriertVon parent is of typ %s',
        async (parentTyp: OrganisationsTyp) => {
            const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.BEHOERDE,
                administriertVon: faker.string.uuid(),
            });
            orgaRepoMock.findById.mockResolvedValueOnce(
                DoFactory.createOrganisation(true, { typ: parentTyp }),
            );

            await expect(sut.isSatisfiedBy(behoerde)).resolves.toBe(true);
        },
    );

    it('should return false, if administriertVon parent is of a different typ', async () => {
        const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.BEHOERDE,
            administriertVon: faker.string.uuid(),
        });
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );

        await expect(sut.isSatisfiedBy(behoerde)).resolves.toBe(false);
    });
});
