import { MikroORM } from '@mikro-orm/core';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigTestModule } from '../../../../test/utils/config-test.module.js';
import { DeepMocked } from '../../../../test/utils/createMock.js';
import { DatabaseTestModule } from '../../../../test/utils/database-test.module.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { createPersonPermissionsMock, LoggingTestModule } from '../../../../test/utils/index.js';
import { EventModule } from '../../../core/eventbus/index.js';
import { DataConfig } from '../../../shared/config/data.config.js';
import { ServerConfig } from '../../../shared/config/server.config.js';
import { DomainError } from '../../../shared/error/index.js';
import { IPersonPermissions } from '../../../shared/permissions/person-permissions.interface.js';
import { PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { OrganisationEntity } from '../persistence/organisation.entity.js';
import { mapOrgaAggregateToData, OrganisationRepository } from '../persistence/organisation.repository.js';
import { KlasseNurVonSchuleAdministriertError } from '../specification/error/klasse-nur-von-schule-administriert.error.js';
import { KlassenNameAnSchuleEindeutigError } from '../specification/error/klassen-name-an-schule-eindeutig.error.js';
import { OrganisationsOnDifferentSubtreesError } from '../specification/error/organisations-on-different-subtrees.error.js';
import { SchuleUnterTraegerError } from '../specification/error/schule-unter-traeger.error.js';
import { ZyklusInOrganisationenError } from '../specification/error/zyklus-in-organisationen.error.js';
import { OrganisationsTyp } from './organisation.enums.js';
import { Organisation } from './organisation.js';
import { OrganisationService } from './organisation.service.js';

describe('OrganisationServiceSpecificationTest', () => {
    let module: TestingModule;
    let organisationService: OrganisationService;
    let organisationRepository: OrganisationRepository;
    let orm: MikroORM;
    let root: Organisation<true>;
    let oeffentlich: Organisation<true>;
    let ersatz: Organisation<true>;
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
            zugehoerigZu: undefined,
            typ: OrganisationsTyp.ROOT,
        });
        await orm.em.persist(orm.em.create(OrganisationEntity, mapOrgaAggregateToData(root))).flush();
        oeffentlich = await organisationRepository.save(
            DoFactory.createOrganisation(false, {
                name: 'Öffentliche Schulen',
                administriertVon: root.id,
                zugehoerigZu: root.id,
                typ: OrganisationsTyp.LAND,
            }),
        );
        ersatz = await organisationRepository.save(
            DoFactory.createOrganisation(false, {
                name: 'Ersatz',
                administriertVon: root.id,
                zugehoerigZu: root.id,
                typ: OrganisationsTyp.LAND,
            }),
        );
        const traeger1Do: Organisation<boolean> = DoFactory.createOrganisation(false, {
            name: 'Träger1',
            administriertVon: oeffentlich.id,
            zugehoerigZu: oeffentlich.id,
            typ: OrganisationsTyp.TRAEGER,
        });
        traeger1 = await organisationRepository.save(traeger1Do);
    });

    it('should be defined', () => {
        expect(organisationService).toBeDefined();
    });

    describe('create', () => {
        const permissionsMock: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
        it('should return DomainError, when KlasseNurVonSchuleAdministriert specificaton is not satisfied and type is KLASSE', async () => {
            const klasseDo: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Klasse',
                administriertVon: traeger1.id,
                zugehoerigZu: traeger1.id,
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
                zugehoerigZu: traeger1.id,
                typ: OrganisationsTyp.SCHULE,
            });
            const schule: Organisation<true> = await organisationRepository.save(schuleDo);
            const klasseDo: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Klasse',
                administriertVon: schule.id,
                zugehoerigZu: schule.id,
                typ: OrganisationsTyp.KLASSE,
            });
            await organisationRepository.save(klasseDo);
            const weitereKlasseDo: Organisation<boolean> = DoFactory.createOrganisation(false, {
                name: 'Klasse',
                administriertVon: schule.id,
                zugehoerigZu: schule.id,
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
                administriertVon: traeger1.id,
                zugehoerigZu: traeger1.id,
                typ: OrganisationsTyp.KLASSE,
            });
            const klassePersisted: Organisation<true> = await organisationRepository.save(klasse);

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

    describe('setZugehoerigZu', () => {
        it('should update the organisation', async () => {
            const school: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: oeffentlich.id,
                    zugehoerigZu: oeffentlich.id,
                }),
            );
            const traeger: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.TRAEGER,
                    administriertVon: oeffentlich.id,
                    zugehoerigZu: oeffentlich.id,
                }),
            );
            const permissions: IPersonPermissions = createPersonPermissionsMock();

            const result: Result<void> = await organisationService.setZugehoerigZu(traeger.id, school.id, permissions);

            expect(result).toEqual<Result<void>>({
                ok: true,
                value: undefined,
            });
        });

        it('should return a domain error if the organisation would switch subtrees', async () => {
            const school: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: oeffentlich.id,
                    zugehoerigZu: oeffentlich.id,
                }),
            );
            const traeger: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.TRAEGER,
                    administriertVon: ersatz.id,
                    zugehoerigZu: ersatz.id,
                }),
            );
            const permissions: IPersonPermissions = createPersonPermissionsMock();

            const result: Result<void> = await organisationService.setZugehoerigZu(traeger.id, school.id, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new OrganisationsOnDifferentSubtreesError(),
            });
        });

        it('should return a domain error if the SchuleUnterTraeger specification is not met', async () => {
            const school: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: oeffentlich.id,
                    zugehoerigZu: oeffentlich.id,
                }),
            );
            const school2: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: oeffentlich.id,
                    zugehoerigZu: oeffentlich.id,
                }),
            );
            const permissions: IPersonPermissions = createPersonPermissionsMock();

            const result: Result<void> = await organisationService.setZugehoerigZu(school2.id, school.id, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new SchuleUnterTraegerError(school.id),
            });
        });

        it('should return a domain error if the ZyklusInZugehoerigZu specification is not met', async () => {
            const school: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.SCHULE,
                    administriertVon: oeffentlich.id,
                    zugehoerigZu: oeffentlich.id,
                }),
            );
            const traeger: Organisation<true> = await organisationRepository.save(
                DoFactory.createOrganisation(false, {
                    typ: OrganisationsTyp.TRAEGER,
                    administriertVon: school.id,
                    zugehoerigZu: school.id,
                }),
            );
            const permissions: IPersonPermissions = createPersonPermissionsMock();

            const result: Result<void> = await organisationService.setZugehoerigZu(traeger.id, school.id, permissions);

            expect(result).toEqual<Result<void>>({
                ok: false,
                error: new ZyklusInOrganisationenError(school.id),
            });
        });
    });
});
