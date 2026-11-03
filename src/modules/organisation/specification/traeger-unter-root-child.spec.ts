import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { TraegerUnterRootChild } from './traeger-unter-root-child.js';

describe('TraegerUnterRootChild Specification', () => {
    let sut: TraegerUnterRootChild<true, false>;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new TraegerUnterRootChild(orgaRepoMock);
    });

    it('when object is not of type traeger, it should return true', async () => {
        const nonTraeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
        });

        await expect(sut.isSatisfiedBy(nonTraeger)).resolves.toBe(true);
    });

    test('when traeger is directly under oeffentlich, it should return true', async () => {
        const oeffentlich: Organisation<true, false> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.TRAEGER,
        });

        orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([oeffentlich, undefined]);

        const traeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
            zugehoerigZu: oeffentlich.id,
            typ: OrganisationsTyp.TRAEGER,
        });
        await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(true);
    });

    test('when traeger is directly under ersatz, it should return true', async () => {
        const ersatz: Organisation<true, false> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.TRAEGER,
        });

        orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([undefined, ersatz]);

        const traeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
            zugehoerigZu: ersatz.id,
            typ: OrganisationsTyp.TRAEGER,
        });
        await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(true);
    });

    test('when traeger is not directly under a root child, it should return false', async () => {
        orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            }),
            DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            }),
        ]);

        const traeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
            zugehoerigZu: faker.string.uuid(),
            typ: OrganisationsTyp.TRAEGER,
        });
        await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(false);
    });
});
