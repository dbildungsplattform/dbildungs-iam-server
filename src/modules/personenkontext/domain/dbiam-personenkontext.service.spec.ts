import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { Personenkontext } from './personenkontext.js';
import { faker } from '@faker-js/faker';
import { PersonenkontextFactory } from './personenkontext.factory.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { DBiamPersonenkontextService } from './dbiam-personenkontext.service.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { RollenArt, RollenMerkmal } from '../../rolle/domain/rolle.enums.js';
import { Rolle } from '../../rolle/domain/rolle.js';

describe('DBiamPersonenkontextService', () => {
    let module: TestingModule;
    let sut: DBiamPersonenkontextService;
    let dbiamPersonenKontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let rolleRepoMock: DeepMocked<RolleRepo>;

    let personenkontextFactory: PersonenkontextFactory;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                DBiamPersonenkontextService,
                PersonenkontextFactory,
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
            ],
        }).compile();
        sut = module.get(DBiamPersonenkontextService);
        dbiamPersonenKontextRepoMock = module.get(DBiamPersonenkontextRepo);
        rolleRepoMock = module.get(RolleRepo);
        personenkontextFactory = module.get(PersonenkontextFactory);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(DBiamPersonenkontextService).toBeDefined();
    });

    describe('isPersonalnummerRequiredForAnyPersonenkontextForPerson', () => {
        describe('when any personenkontext has a rolle with koperspflichtig merkmale', () => {
            it('should return true', async () => {
                const personenkontexte: Personenkontext<true>[] = [
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '1'),
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '2', '1'),
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '2'),
                ];
                dbiamPersonenKontextRepoMock.findByPerson.mockResolvedValue(personenkontexte);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(
                    '1',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LEHR,
                        merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                        id: '1',
                    }),
                );
                mapRollen.set('2', DoFactory.createRolle(true, { rollenart: RollenArt.LEIT, merkmale: [], id: '2' }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const result: boolean = await sut.isPersonalnummerRequiredForAnyPersonenkontextForPerson('1');
                expect(result).toBeTruthy();
            });
        });

        describe('when no personenkontext has a rolle with koperspflichtig merkmale', () => {
            it('should return false', async () => {
                const personenkontexte: Personenkontext<true>[] = [
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '1'),
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '2', '1'),
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '2'),
                ];
                dbiamPersonenKontextRepoMock.findByPerson.mockResolvedValue(personenkontexte);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(
                    '1',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LERN,
                        merkmale: [],
                        id: '1',
                    }),
                );
                mapRollen.set('2', DoFactory.createRolle(true, { rollenart: RollenArt.LEIT, merkmale: [], id: '2' }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const result: boolean = await sut.isPersonalnummerRequiredForAnyPersonenkontextForPerson('1');
                expect(result).toBeFalsy();
            });
        });
    });

    describe('IsPersonalnummerRequiredByRoleIds', () => {
        describe('when any rolle has koperspflichtig merkmal', () => {
            it('should return true', async () => {
                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(
                    '1',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LEHR,
                        merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                        id: '1',
                    }),
                );
                mapRollen.set('2', DoFactory.createRolle(true, { rollenart: RollenArt.LEIT, merkmale: [], id: '2' }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const result: boolean = await sut.isPersonalnummerRequiredByRoleIds(['1', '2']);
                expect(result).toBeTruthy();
            });
        });

        describe('when no personenkontext has a rolle with koperspflichtig merkmale', () => {
            it('should return false', async () => {
                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(
                    '1',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LERN,
                        merkmale: [],
                        id: '1',
                    }),
                );
                mapRollen.set('2', DoFactory.createRolle(true, { rollenart: RollenArt.LEIT, merkmale: [], id: '2' }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const result: boolean = await sut.isPersonalnummerRequiredByRoleIds(['1', '2']);
                expect(result).toBeFalsy();
            });
        });
    });

    describe('getKopersPersonenkontexte', () => {
        describe('when a person has a personenkontext with a rolle with koperspflichtig merkmale', () => {
            it('should return the personenkontext', async () => {
                const personenkontexte: Personenkontext<true>[] = [
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '1'),
                    personenkontextFactory.construct('2', faker.date.past(), faker.date.recent(), '', '1', '2', '1'),
                    personenkontextFactory.construct('3', faker.date.past(), faker.date.recent(), '', '1', '1', '2'),
                ];
                dbiamPersonenKontextRepoMock.findByPerson.mockResolvedValue(personenkontexte);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(
                    '1',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LEHR,
                        merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                        id: '1',
                    }),
                );
                mapRollen.set('2', DoFactory.createRolle(true, { rollenart: RollenArt.LEIT, merkmale: [], id: '2' }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const result: Personenkontext<true>[] = await sut.getKopersPersonenkontexte('1');
                expect(result[0]).toEqual(personenkontexte[0]);
            });
        });

        describe('when a person has multiple personenkontexts with a rolle with koperspflichtig merkmale', () => {
            it('should return the personenkontext', async () => {
                const personenkontexte: Personenkontext<true>[] = [
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '1'),
                    personenkontextFactory.construct('2', faker.date.past(), faker.date.recent(), '', '1', '2', '2'),
                    personenkontextFactory.construct('3', faker.date.past(), faker.date.recent(), '', '1', '1', '3'),
                ];
                dbiamPersonenKontextRepoMock.findByPerson.mockResolvedValue(personenkontexte);

                const mapRollen: Map<string, Rolle<true>> = new Map();
                mapRollen.set(
                    '1',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LEHR,
                        merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                        id: '1',
                    }),
                );
                mapRollen.set(
                    '2',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LEHR,
                        merkmale: [RollenMerkmal.KOPERS_PFLICHT],
                        id: '2',
                    }),
                );
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const result: Personenkontext<true>[] = await sut.getKopersPersonenkontexte('1');
                expect(result.length).toBe(2);
                expect(result[0]).toEqual(personenkontexte[0]);
                expect(result[1]).toEqual(personenkontexte[1]);
            });
        });

        describe('when a person has no personenkontext with a rolle with koperspflichtig merkmale', () => {
            it('should return undefined', async () => {
                const personenkontexte: Personenkontext<true>[] = [
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '1'),
                    personenkontextFactory.construct('2', faker.date.past(), faker.date.recent(), '', '1', '2', '1'),
                    personenkontextFactory.construct('3', faker.date.past(), faker.date.recent(), '', '1', '1', '2'),
                ];
                dbiamPersonenKontextRepoMock.findByPerson.mockResolvedValue(personenkontexte);

                const mapRollen: Map<string, Rolle<true>> = new Map();

                mapRollen.set(
                    '1',
                    DoFactory.createRolle(true, {
                        rollenart: RollenArt.LERN,
                        merkmale: [],
                        id: '1',
                    }),
                );

                mapRollen.set('2', DoFactory.createRolle(true, { rollenart: RollenArt.LEIT, merkmale: [], id: '2' }));
                rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen);

                const result: Personenkontext<true>[] = await sut.getKopersPersonenkontexte('1');
                expect(result.length).toBe(0);
            });
        });
    });
});
