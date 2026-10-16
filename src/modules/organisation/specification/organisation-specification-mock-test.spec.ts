import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigTestModule, DatabaseTestModule, DoFactory, LoggingTestModule } from '../../../../test/utils/index.js';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { NurKlasseKursUnterSchule } from './nur-klasse-kurs-unter-schule.js';
import { SchuleUnterTraeger } from './schule-unter-traeger.js';
import { KlasseNurVonSchuleAdministriert } from './klasse-nur-von-schule-administriert.js';
import { KlassenNameAnSchuleEindeutig } from './klassen-name-an-schule-eindeutig.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { type Organisation } from '../domain/organisation.js';

describe('OrganisationSpecificationMockedRepoTest', () => {
    let module: TestingModule;
    let organisationRepositoryMock: DeepMocked<OrganisationRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: false }), LoggingTestModule],
            providers: [
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
            ],
        }).compile();
        organisationRepositoryMock = module.get(OrganisationRepository);
    }, 100000);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('schule-unter-traeger', () => {
        it('should be satisfied when organisation is not SCHULE', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(organisationRepositoryMock);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SONSTIGE,
                administriertVon: '1',
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            expect(await schuleUnterTraeger.isSatisfiedBy(schule)).toBeTruthy();
        });

        it('should not be satisfied when organisation referenced by administriertVon cannot be found', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(organisationRepositoryMock);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                administriertVon: '1',
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            expect(await schuleUnterTraeger.isSatisfiedBy(schule)).toBeFalsy();
        });

        it('should not be satisfied when organisation referenced by zugehoerigZu cannot be found', async () => {
            const schuleUnterTraeger: SchuleUnterTraeger = new SchuleUnterTraeger(organisationRepositoryMock);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
                administriertVon: '1',
                zugehoerigZu: '1',
            });
            const traeger: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.TRAEGER,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(traeger); //mock call to administriertVon
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            expect(await schuleUnterTraeger.isSatisfiedBy(schule)).toBeFalsy();
        });
    });

    describe('nur-klasse-kurs-unter-schule', () => {
        it('should be satisfied when organisation referenced by administriertVon cannot be found', async () => {
            const nurKlasseKursUnterSchule: NurKlasseKursUnterSchule = new NurKlasseKursUnterSchule(
                organisationRepositoryMock,
            );
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: undefined,
                administriertVon: '1',
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule); //mock call to zugehoerigZu
            expect(await nurKlasseKursUnterSchule.isSatisfiedBy(klasse)).toBeTruthy();
        });
        it('should be satisfied when organisation referenced by zugehoerigZu cannot be found', async () => {
            const nurKlasseKursUnterSchule: NurKlasseKursUnterSchule = new NurKlasseKursUnterSchule(
                organisationRepositoryMock,
            );
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: undefined,
                administriertVon: '1',
                zugehoerigZu: '1',
            });
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule); //mock call to administriertVon
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            expect(await nurKlasseKursUnterSchule.isSatisfiedBy(klasse)).toBeTruthy();
        });
    });

    describe('klasse-nur-von-schule-administriert', () => {
        it('should NOT be satisfied when organisation referenced by administriertVon cannot be found', async () => {
            const klasseNurVonSchuleAdministriert: KlasseNurVonSchuleAdministriert =
                new KlasseNurVonSchuleAdministriert(organisationRepositoryMock);
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                administriertVon: '1',
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule); //mock call to zugehoerigZu
            expect(await klasseNurVonSchuleAdministriert.isSatisfiedBy(klasse)).toBeFalsy();
        });
        it('should NOT be satisfied when organisation referenced by zugehoerigZu cannot be found', async () => {
            const klasseNurVonSchuleAdministriert: KlasseNurVonSchuleAdministriert =
                new KlasseNurVonSchuleAdministriert(organisationRepositoryMock);
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                administriertVon: '1',
                zugehoerigZu: '1',
            });
            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule); //mock call to administriertVon
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            expect(await klasseNurVonSchuleAdministriert.isSatisfiedBy(klasse)).toBeFalsy();
        });
    });

    describe('klassen-name-an-schule-eindeutig', () => {
        it('should NOT be satisfied when organisation referenced by administriertVon cannot be found', async () => {
            const klassenNameAnSchuleEindeutig: KlassenNameAnSchuleEindeutig = new KlassenNameAnSchuleEindeutig(
                organisationRepositoryMock,
            );
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                administriertVon: '1',
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(null);
            expect(await klassenNameAnSchuleEindeutig.isSatisfiedBy(klasse)).toBeFalsy();
        });

        it('should NOT be satisfied when Klasse with same name already exists on same Schule', async () => {
            const klassenNameAnSchuleEindeutig: KlassenNameAnSchuleEindeutig = new KlassenNameAnSchuleEindeutig(
                organisationRepositoryMock,
            );
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '9a',
                administriertVon: '1',
            });

            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            const andereKlasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '9a',
                administriertVon: schule.id,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule); //mock call to find schule as parent
            organisationRepositoryMock.findChildOrgasForIds.mockResolvedValueOnce([andereKlasse]);
            expect(await klassenNameAnSchuleEindeutig.isSatisfiedBy(klasse)).toBeFalsy();
        });

        it('should be satisfied when other Klassen on Schule exist, but have different names', async () => {
            const klassenNameAnSchuleEindeutig: KlassenNameAnSchuleEindeutig = new KlassenNameAnSchuleEindeutig(
                organisationRepositoryMock,
            );
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '10b',
                administriertVon: '1',
            });

            const schule: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.SCHULE,
            });
            const andereKlasse: Organisation<true> = DoFactory.createOrganisation(true, {
                typ: OrganisationsTyp.KLASSE,
                name: '9a',
                administriertVon: schule.id,
            });
            organisationRepositoryMock.findById.mockResolvedValueOnce(schule); //mock call to find schule as parent
            organisationRepositoryMock.findChildOrgasForIds.mockResolvedValueOnce([andereKlasse]);
            expect(await klassenNameAnSchuleEindeutig.isSatisfiedBy(klasse)).toBeTruthy();
        });
    });
});
