import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { NurKlasseKursUnterSchule } from './nur-klasse-kurs-unter-schule.js';

describe('NurKlasseKursUnterSchule Specification', () => {
    let sut: NurKlasseKursUnterSchule;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new NurKlasseKursUnterSchule(orgaRepoMock);
    });

    it('should return true, if administriertVon parent does not exist', async () => {
        const orga: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.UNBEST,
            administriertVon: faker.string.uuid(),
        });

        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(orga)).resolves.toBe(true);
    });

    it('should return true, if zugehoerigZu parent does not exist', async () => {
        const orga: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.UNBEST,
            zugehoerigZu: faker.string.uuid(),
        });

        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(orga)).resolves.toBe(true);
    });
});
