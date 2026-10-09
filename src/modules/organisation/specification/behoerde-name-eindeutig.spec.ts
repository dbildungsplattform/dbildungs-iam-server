import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { BehoerdeNameUnique } from './behoerde-name-eindeutig.js';

describe('BehoerdeNameEindeutig Specification', () => {
    let sut: BehoerdeNameUnique;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new BehoerdeNameUnique(orgaRepoMock);
    });

    it('should ignore organisations when typ is not BEHOERDE', async () => {
        const nonBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
        });

        await expect(sut.isSatisfiedBy(nonBehoerde)).resolves.toBe(true);
    });

    it('should return true, if no other Behoerde with the same name exists', async () => {
        const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.BEHOERDE,
        });
        orgaRepoMock.findBy.mockResolvedValueOnce([[], 0]);

        await expect(sut.isSatisfiedBy(behoerde)).resolves.toBe(true);
    });

    it('should return true, if the only Behoerde with the same name is itself', async () => {
        const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.BEHOERDE,
        });
        orgaRepoMock.findBy.mockResolvedValueOnce([[behoerde], 1]);

        await expect(sut.isSatisfiedBy(behoerde)).resolves.toBe(true);
    });

    it('should return false, if another Behoerde with the same name exists', async () => {
        const behoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.BEHOERDE,
        });
        const otherBehoerde: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.BEHOERDE,
            name: behoerde.name,
        });
        orgaRepoMock.findBy.mockResolvedValueOnce([[otherBehoerde], 1]);

        await expect(sut.isSatisfiedBy(behoerde)).resolves.toBe(false);
    });
});
