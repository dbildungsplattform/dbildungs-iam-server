import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { SchuleUnterTraeger } from './schule-unter-traeger.js';

describe('SchuleUnterTraeger Specification', () => {
    let sut: SchuleUnterTraeger;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new SchuleUnterTraeger(orgaRepoMock);
    });

    it('should ignore organisations when typ is not SCHULE', async () => {
        const nonSchool: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.ROOT,
        });

        await expect(sut.isSatisfiedBy(nonSchool)).resolves.toBe(true);
    });

    it('should return false, if administriertVon is not set', async () => {
        const nonSchool: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
            administriertVon: undefined,
        });

        await expect(sut.isSatisfiedBy(nonSchool)).resolves.toBe(false);
    });

    it('should return false, if administriertVon parent does not exist', async () => {
        const nonSchool: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
            administriertVon: faker.string.uuid(),
        });
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(nonSchool)).resolves.toBe(false);
    });

    it('should return false, if zugehoerigZu is not set', async () => {
        const nonSchool: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
            administriertVon: faker.string.uuid(),
            zugehoerigZu: undefined,
        });
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            }),
        );

        await expect(sut.isSatisfiedBy(nonSchool)).resolves.toBe(false);
    });

    it('should return false, if zugehoerigZu parent does not exist', async () => {
        const nonSchool: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
            administriertVon: faker.string.uuid(),
            zugehoerigZu: faker.string.uuid(),
        });
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(nonSchool)).resolves.toBe(false);
    });

    it('should return true, if administriertVon parent is typ LAND and zugehoerigZu parent is TRAEGER', async () => {
        const nonSchool: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
            administriertVon: faker.string.uuid(),
            zugehoerigZu: faker.string.uuid(),
        });
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            }),
        );

        await expect(sut.isSatisfiedBy(nonSchool)).resolves.toBe(true);
    });

    it('should return true, if administriertVon parent is typ LAND and zugehoerigZu parent is LAND', async () => {
        const nonSchool: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
            administriertVon: faker.string.uuid(),
            zugehoerigZu: faker.string.uuid(),
        });
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.LAND,
            }),
        );

        await expect(sut.isSatisfiedBy(nonSchool)).resolves.toBe(true);
    });
});
