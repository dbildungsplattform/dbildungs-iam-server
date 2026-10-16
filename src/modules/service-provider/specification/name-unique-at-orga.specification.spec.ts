import { DoFactory } from '../../../../test/utils/index.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { type ServiceProvider } from '../domain/service-provider.js';
import { ServiceProviderInternalRepo } from '../repo/service-provider.internal.repo.js';
import { NameUniqueAtOrgaSpecification } from './name-unique-at-orga.specification.js';

describe('NameUniqueAtOrgaSpecification', () => {
    const spRepoMock: DeepMocked<ServiceProviderInternalRepo> = createMock(ServiceProviderInternalRepo);
    const sut: NameUniqueAtOrgaSpecification = new NameUniqueAtOrgaSpecification(spRepoMock);

    const sp: ServiceProvider<boolean> = DoFactory.createServiceProvider(true);

    describe('isSatisfiedBy', () => {
        it('should return true, if the name is unique', async () => {
            spRepoMock.existsDuplicateNameForOrganisation.mockResolvedValueOnce(false);

            await expect(sut.isSatisfiedBy(sp)).resolves.toBe(true);
        });

        it('should return false, if the name is already in use', async () => {
            spRepoMock.existsDuplicateNameForOrganisation.mockResolvedValueOnce(true);

            await expect(sut.isSatisfiedBy(sp)).resolves.toBe(false);
        });
    });
});
