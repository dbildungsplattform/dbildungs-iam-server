import { faker } from '@faker-js/faker';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../test/utils/index.js';
import { DomainError } from '../../../shared/error/index.js';
import { OrganisationID } from '../../../shared/types/index.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { RollenerweiterungRepo } from '../../rolle/repo/rollenerweiterung.repo.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { OrganisationHasChildrenError } from './errors/organisation-has-children.error.js';
import { OrganisationHasPersonenkontexteError } from './errors/organisation-has-personenkontexte.error.js';
import { OrganisationHasRollenError } from './errors/organisation-has-rollen.error.js';
import { OrganisationHasRollenerweiterungError } from './errors/organisation-has-rollenerweiterung.error.js';
import { OrganisationHasServiceProvidersError } from './errors/organisation-has-service-provider.error.js';
import { OrganisationHasZugehoerigeError } from './errors/organisation-has-zugehoerige.error.js';
import { OrganisationDeleteService } from './organisation-delete.service.js';

describe('OrganisationDeleteService', () => {
    let module: TestingModule;
    let organisationRepo: DeepMocked<OrganisationRepository>;
    let rolleRepo: DeepMocked<RolleRepo>;
    let personenkontextRepo: DeepMocked<DBiamPersonenkontextRepo>;
    let serviceProviderRepoRepo: DeepMocked<ServiceProviderRepo>;
    let rollenerweiterungRepo: DeepMocked<RollenerweiterungRepo>;

    let organisationDeleteService: OrganisationDeleteService;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                OrganisationDeleteService,
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                {
                    provide: ServiceProviderRepo,
                    useValue: createMock(ServiceProviderRepo),
                },
                {
                    provide: RollenerweiterungRepo,
                    useValue: createMock(RollenerweiterungRepo),
                },
            ],
        }).compile();
        organisationRepo = module.get(OrganisationRepository);
        rolleRepo = module.get(RolleRepo);
        personenkontextRepo = module.get(DBiamPersonenkontextRepo);
        serviceProviderRepoRepo = module.get(ServiceProviderRepo);
        organisationDeleteService = module.get(OrganisationDeleteService);
        rollenerweiterungRepo = module.get(RollenerweiterungRepo);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('deleteOrganisation', () => {
        it('should call delete, if no references are found', async () => {
            organisationRepo.findBy
                .mockResolvedValueOnce([[], 0]) // child orgs
                .mockResolvedValueOnce([[], 0]); // zugehoerige orgs
            rolleRepo.findBySchulstrukturknoten.mockResolvedValue([]);
            personenkontextRepo.findBy.mockResolvedValue([[], 0]);
            serviceProviderRepoRepo.findBySchulstrukturknoten.mockResolvedValue([]);
            rollenerweiterungRepo.findManyByOrganisationId.mockResolvedValue([]);

            const organisationId: OrganisationID = faker.string.uuid();

            await organisationDeleteService.deleteOrganisation(organisationId);
            expect(organisationRepo.delete).toHaveBeenCalledTimes(1);
            expect(organisationRepo.delete).toHaveBeenCalledWith(organisationId);
        });

        it('should return OrganisationHasChildrenError, if org has children', async () => {
            const organisationId: OrganisationID = faker.string.uuid();
            organisationRepo.findBy.mockResolvedValueOnce([
                [DoFactory.createOrganisation(true, { administriertVon: organisationId })],
                1,
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(organisationId);

            expect(result).toBeInstanceOf(OrganisationHasChildrenError);
            expect(rolleRepo.findBySchulstrukturknoten).toHaveBeenCalledTimes(0);
            expect(personenkontextRepo.findBy).toHaveBeenCalledTimes(0);
            expect(serviceProviderRepoRepo.findBySchulstrukturknoten).toHaveBeenCalledTimes(0);
            expect(organisationRepo.delete).toHaveBeenCalledTimes(0);
        });

        it('should return OrganisationHasZugehoerigeError, if org has zugehoerige', async () => {
            const organisationId: OrganisationID = faker.string.uuid();
            organisationRepo.findBy
                .mockResolvedValueOnce([[], 0])
                .mockResolvedValueOnce([[DoFactory.createOrganisation(true, { zugehoerigZu: organisationId })], 1]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(organisationId);

            expect(result).toBeInstanceOf(OrganisationHasZugehoerigeError);
            expect(rolleRepo.findBySchulstrukturknoten).toHaveBeenCalledTimes(0);
            expect(personenkontextRepo.findBy).toHaveBeenCalledTimes(0);
            expect(serviceProviderRepoRepo.findBySchulstrukturknoten).toHaveBeenCalledTimes(0);
            expect(organisationRepo.delete).toHaveBeenCalledTimes(0);
        });

        it('should return OrganisationHasRollenError, if rollen are administered by org', async () => {
            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);
            const organisationId: OrganisationID = faker.string.uuid();
            rolleRepo.findBySchulstrukturknoten.mockResolvedValue([
                DoFactory.createRolle(true, { administeredBySchulstrukturknoten: organisationId }),
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(organisationId);

            expect(result).toBeInstanceOf(OrganisationHasRollenError);
            expect(personenkontextRepo.findBy).toHaveBeenCalledTimes(0);
            expect(serviceProviderRepoRepo.findBySchulstrukturknoten).toHaveBeenCalledTimes(0);
            expect(organisationRepo.delete).toHaveBeenCalledTimes(0);
        });

        it('should return OrganisationHasPersonenkontexteError, if org has personenkontexte', async () => {
            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);
            const organisationId: OrganisationID = faker.string.uuid();
            rolleRepo.findBySchulstrukturknoten.mockResolvedValue([]);
            personenkontextRepo.findBy.mockResolvedValue([
                [DoFactory.createPersonenkontext(true, { organisationId })],
                1,
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(organisationId);

            expect(result).toBeInstanceOf(OrganisationHasPersonenkontexteError);
            expect(serviceProviderRepoRepo.findBySchulstrukturknoten).toHaveBeenCalledTimes(0);
            expect(organisationRepo.delete).toHaveBeenCalledTimes(0);
        });

        it('should return OrganisationHasServiceProvidersError, if org has serviceProviders', async () => {
            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);
            const organisationId: OrganisationID = faker.string.uuid();
            rolleRepo.findBySchulstrukturknoten.mockResolvedValue([]);
            personenkontextRepo.findBy.mockResolvedValue([[], 0]);
            serviceProviderRepoRepo.findBySchulstrukturknoten.mockResolvedValue([
                DoFactory.createServiceProvider(true, { providedOnSchulstrukturknoten: organisationId }),
            ]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(organisationId);

            expect(result).toBeInstanceOf(OrganisationHasServiceProvidersError);
            expect(organisationRepo.delete).toHaveBeenCalledTimes(0);
        });

        it('should return OrganisationHasRollenerweiterungError, if org has rollenerweiterungen', async () => {
            organisationRepo.findBy.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[], 0]);
            const organisationId: OrganisationID = faker.string.uuid();
            rolleRepo.findBySchulstrukturknoten.mockResolvedValue([]);
            personenkontextRepo.findBy.mockResolvedValue([[], 0]);
            serviceProviderRepoRepo.findBySchulstrukturknoten.mockResolvedValue([]);
            rollenerweiterungRepo.findManyByOrganisationId.mockResolvedValue([DoFactory.createRollenerweiterung(true)]);

            const result: void | DomainError = await organisationDeleteService.deleteOrganisation(organisationId);

            expect(result).toBeInstanceOf(OrganisationHasRollenerweiterungError);
            expect(organisationRepo.delete).toHaveBeenCalledTimes(0);
        });
    });
});
