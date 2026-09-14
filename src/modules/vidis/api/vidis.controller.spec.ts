import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { createPersonPermissionsMock } from '../../../../test/utils/auth.mock.js';
import { CommonTestModule } from '../../../../test/utils/common-test.module.js';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { createAndPersistOrganisation } from '../../../../test/utils/organisation-test-helper.js';
import { createAndPersistServiceProvider } from '../../../../test/utils/service-provider-test-helper.js';
import { Err, Ok } from '../../../shared/util/result.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { OrganisationEntity } from '../../organisation/persistence/organisation.entity.js';
import { EscalatedPersonPermissionsFactory } from '../../permission/escalated-person-permissions.factory.js';
import { EscalatedPersonPermissions } from '../../permission/escalated-person-permissions.js';
import { ServiceProvider } from '../../service-provider/domain/service-provider.js';
import { ServiceProviderRepo } from '../../service-provider/repo/service-provider.repo.js';
import { VidisApiAdapter } from '../adapter/domain/vidis-api.adapter.js';
import { VidisApiResponseAngebotBySchool } from '../adapter/domain/vidis.types.js';
import { VidisApiError } from '../error/vidis-api.error.js';
import { VidisModule } from '../vidis.module.js';
import { VidisController } from './vidis.controller.js';

function createVidisAngebotBySchool(offerId: number, offerTitle: string): VidisApiResponseAngebotBySchool {
    return {
        clientId: faker.string.uuid(),
        educationProviderOrganizationName: faker.company.name(),
        offerDescription: faker.lorem.sentence(),
        offerId,
        offerLink: faker.internet.url(),
        offerLogo: '',
        offerLongTitle: `${offerTitle} long`,
        offerTitle,
        offerVersion: 1,
    };
}
describe('VidisController', () => {
    let module: TestingModule;
    let vidisController: VidisController;
    let vidisApiAdapterMock: DeepMocked<VidisApiAdapter>;
    let serviceProviderRepo: ServiceProviderRepo;
    let orm: MikroORM;
    let em: EntityManager;
    let escalatedPersonPermissionsFactoryMock: DeepMocked<EscalatedPersonPermissionsFactory>;
    let permissionsMock: EscalatedPersonPermissions;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [CommonTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true }), VidisModule],
        })
            .overrideProvider(VidisApiAdapter)
            .useValue(createMock(VidisApiAdapter))
            .overrideProvider(EscalatedPersonPermissionsFactory)
            .useValue(createMock(EscalatedPersonPermissionsFactory))
            .compile();

        orm = module.get(MikroORM);
        await DatabaseTestModule.setupDatabase(orm);

        em = module.get(EntityManager);
        vidisController = module.get(VidisController);
        vidisApiAdapterMock = module.get(VidisApiAdapter);
        serviceProviderRepo = module.get(ServiceProviderRepo);
        escalatedPersonPermissionsFactoryMock = module.get(EscalatedPersonPermissionsFactory);
    });

    afterEach(async () => {
        vi.resetAllMocks();
        await DatabaseTestModule.clearDatabase(orm);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        permissionsMock = createPersonPermissionsMock() as unknown as EscalatedPersonPermissions;
        escalatedPersonPermissionsFactoryMock.fromPermissions.mockResolvedValue(permissionsMock);
    });

    describe('syncAngeboteForSchool', () => {
        it('should remove stale school Angebote, add two new ones and skip one that already exists on a non school organisation', async () => {
            const school: OrganisationEntity = await createAndPersistOrganisation(
                em,
                undefined,
                OrganisationsTyp.SCHULE,
            );
            const nonSchool: OrganisationEntity = await createAndPersistOrganisation(
                em,
                undefined,
                OrganisationsTyp.LAND,
            );

            const staleSchoolAngebot: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                name: 'Stale school Angebot',
                providedOnSchulstrukturknoten: school.id,
                vidisAngebotId: '1001',
            });
            const existingNonSchoolAngebot: ServiceProvider<true> = await createAndPersistServiceProvider(em, {
                name: 'Existing non school Angebot',
                providedOnSchulstrukturknoten: nonSchool.id,
                vidisAngebotId: '3003',
            });

            const angebotReturnedByVidisOnlyForSchool: VidisApiResponseAngebotBySchool[] = [
                createVidisAngebotBySchool(2001, 'New school Angebot 1'),
                createVidisAngebotBySchool(2002, 'New school Angebot 2'),
                createVidisAngebotBySchool(3003, 'Duplicate non school Angebot'),
            ];

            vidisApiAdapterMock.getActivatedAngeboteBySchool.mockResolvedValueOnce(
                Ok(angebotReturnedByVidisOnlyForSchool),
            );

            await vidisController.syncAngeboteForSchool(createPersonPermissionsMock(), {
                organisationId: school.id,
            });

            const schoolAngeboteAfterSync: ServiceProvider<true>[] =
                await serviceProviderRepo.findVidisAngeboteforSchools([school.id]);
            const nonSchoolAngeboteAfterSync: ServiceProvider<true>[] =
                await serviceProviderRepo.findNonSchoolProvidedVidisAngebote();
            const removedSchoolAngebot: Option<ServiceProvider<true>> = await serviceProviderRepo.findByVidisAngebotId(
                staleSchoolAngebot.vidisAngebotId!,
            );
            const skippedDuplicateSchoolAngebot: ServiceProvider<true>[] =
                await serviceProviderRepo.findVidisAngeboteforSchools([school.id]);

            expect(vidisApiAdapterMock.getActivatedAngeboteBySchool).toHaveBeenCalledWith(school.kennung);
            expect(schoolAngeboteAfterSync).toHaveLength(2);
            expect(
                schoolAngeboteAfterSync.map((angebot: ServiceProvider<true>) => angebot.vidisAngebotId).sort(),
            ).toEqual(['2001', '2002']);
            expect(removedSchoolAngebot).toBeNull();
            expect(nonSchoolAngeboteAfterSync).toHaveLength(1);
            expect(nonSchoolAngeboteAfterSync[0]?.id).toEqual(existingNonSchoolAngebot.id);
            expect(
                skippedDuplicateSchoolAngebot.some(
                    (angebot: ServiceProvider<true>) => angebot.vidisAngebotId === '3003',
                ),
            ).toBe(false);
        });

        it('should throw a VIDIS api error when loading school Angebote fails', async () => {
            const school: OrganisationEntity = await createAndPersistOrganisation(
                em,
                undefined,
                OrganisationsTyp.SCHULE,
            );
            const vidisApiError: VidisApiError = new VidisApiError(faker.lorem.sentence());

            vidisApiAdapterMock.getActivatedAngeboteBySchool.mockResolvedValueOnce(Err(vidisApiError));

            await expect(
                vidisController.syncAngeboteForSchool(createPersonPermissionsMock(), {
                    organisationId: school.id,
                }),
            ).rejects.toBe(vidisApiError);

            const schoolAngeboteAfterSync: ServiceProvider<true>[] =
                await serviceProviderRepo.findVidisAngeboteforSchools([school.id]);

            expect(vidisApiAdapterMock.getActivatedAngeboteBySchool).toHaveBeenCalledWith(school.kennung);
            expect(schoolAngeboteAfterSync).toEqual([]);
        });
    });
});
