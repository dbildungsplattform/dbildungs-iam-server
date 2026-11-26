import { MikroORM } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { type DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { createPersonPermissionsMock, LoggingTestModule } from '../../../../test/utils/index.js';
import { EventModule } from '../../../core/eventbus/index.js';
import { type DataConfig } from '../../../shared/config/data.config.js';
import { type ServerConfig } from '../../../shared/config/server.config.js';
import { type DomainError } from '../../../shared/error/index.js';
import { type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationEntity } from '../persistence/organisation.entity.js';
import { mapOrgaAggregateToData, OrganisationRepository } from '../persistence/organisation.repository.js';
import { KlasseNurVonSchuleAdministriertError } from '../specification/error/klasse-nur-von-schule-administriert.error.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { OrganisationsTyp } from './organisation.enums.js';
import { type Organisation } from './organisation.js';
import { OrganisationService } from './organisation.service.js';

describe('OrganisationServiceSpecificationTest', () => {
    let module: TestingModule;
    let organisationService: OrganisationService;
    let organisationRepository: OrganisationRepository;
    let orm: MikroORM;
    let root: Organisation<true>;
    let oeffentlich: Organisation<true>;
    let traeger1: Organisation<true>;

    let ROOT_ORGANISATION_ID: string;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                LoggingTestModule,
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                EventModule,
                LoggingTestModule,
            ],
            providers: [OrganisationService, OrganisationRepository],
        }).compile();
        organisationService = module.get(OrganisationService);
        organisationRepository = module.get(OrganisationRepository);
        orm = module.get(MikroORM);

        const configModule: ConfigService<ServerConfig> = module.get(ConfigService);
        ROOT_ORGANISATION_ID = configModule.getOrThrow<DataConfig>('DATA').ROOT_ORGANISATION_ID;

        await DatabaseTestModule.setupDatabase(orm);
    }, 100000);

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        vi.resetAllMocks();
        await DatabaseTestModule.clearDatabase(orm);
        root = DoFactory.createOrganisation(true, {
            name: 'Root',
            id: ROOT_ORGANISATION_ID,
            administriertVon: undefined,
            typ: OrganisationsTyp.ROOT,
        });
        await orm.em.persist(orm.em.create(OrganisationEntity, mapOrgaAggregateToData(root))).flush();
        oeffentlich = await organisationRepository.save(
            DoFactory.createOrganisation(false, {
                name: 'Öffentliche Schulen',
                administriertVon: root.id,
                typ: OrganisationsTyp.LAND,
            }),
        );
        await organisationRepository.save(
            DoFactory.createOrganisation(false, {
                name: 'Ersatz',
                administriertVon: root.id,
                typ: OrganisationsTyp.LAND,
            }),
        );
        const traeger1Do: Organisation<boolean> = DoFactory.createOrganisation(false, {
            name: 'Träger1',
            administriertVon: oeffentlich.id,
            typ: OrganisationsTyp.TRAEGER,
        });
        traeger1 = await organisationRepository.save(traeger1Do);
    });

    it('should be defined', () => {
        expect(organisationService).toBeDefined();
    });

    describe('create', () => {
        const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        it('should return DomainError, when KlasseNurVonSchuleAdministriert specification is not satisfied and type is KLASSE', async () => {
            const klasseDo: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Klasse',
                kennung: undefined,
                emailAdress: undefined,
                administriertVon: traeger1.id,
                typ: OrganisationsTyp.KLASSE,
            });

            const result: Result<Organisation<true>, DomainError> = await organisationService.createOrganisation(
                klasseDo,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KlasseNurVonSchuleAdministriertError(undefined),
            });
        });

        it('should return a DomainError when KlassenNameAnSchuleEindeutig specification is not met', async () => {
            const schuleDo: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Schule',
                administriertVon: oeffentlich.id,
                typ: OrganisationsTyp.SCHULE,
            });
            const schule: Organisation<true> = await organisationRepository.save(schuleDo);
            const klasseDo: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Klasse',
                emailAdress: undefined,
                administriertVon: schule.id,
                typ: OrganisationsTyp.KLASSE,
            });
            await organisationRepository.save(klasseDo);
            const weitereKlasseDo: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Klasse',
                kennung: undefined,
                emailAdress: undefined,
                administriertVon: schule.id,
                typ: OrganisationsTyp.KLASSE,
            });
            const result: Result<Organisation<true>> = await organisationService.createOrganisation(
                weitereKlasseDo,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KlassenNameAnSchuleEindeutigError(undefined),
            });
        });
    });

    describe('update', () => {
        const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        it('should return DomainError, when klasse specifications are not satisfied and type is klasse', async () => {
            const klasse: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'klasse',
                emailAdress: undefined,
                administriertVon: traeger1.id,
                typ: OrganisationsTyp.KLASSE,
            });
            const klassePersisted: Organisation<true> = await organisationRepository.save(klasse);

            permissionsMock.hasOrgVerwaltenRechtAtOrga.mockResolvedValueOnce(true);

            const result: Result<Organisation<true>, DomainError> = await organisationService.updateOrganisation(
                klassePersisted,
                permissionsMock,
            );

            expect(result).toEqual<Result<Organisation<true>>>({
                ok: false,
                error: new KlasseNurVonSchuleAdministriertError(klassePersisted.id),
            });
        });
    });
});
