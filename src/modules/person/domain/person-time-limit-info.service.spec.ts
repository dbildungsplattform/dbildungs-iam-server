import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { type TestingModule, Test } from '@nestjs/testing';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import PersonTimeLimitService from './person-time-limit-info.service.js';
import { DBiamPersonenkontextService } from '../../personenkontext/domain/dbiam-personenkontext.service.js';
import { type Person } from '../../person/domain/person.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { TimeLimitOccasion } from '../domain/time-limit-occasion.enums.js';
import { type Personenkontext } from '../../personenkontext/domain/personenkontext.js';
import { type PersonTimeLimitInfo } from './person-time-limit-info.js';
import { KONTEXT_EXPIRES_IN_DAYS, KOPERS_DEADLINE_IN_DAYS, NO_KONTEXTE_DEADLINE_IN_DAYS } from './person-time-limit.js';
import { DBiamPersonenkontextRepo } from '../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { type Rolle } from '../../rolle/domain/rolle.js';

describe('PersonTimeLimitInfoService', () => {
    let module: TestingModule;
    let sut: PersonTimeLimitService;
    let personRepoMock: DeepMocked<PersonRepository>;
    let dBiamPersonenkontextServiceMock: DeepMocked<DBiamPersonenkontextService>;
    let dBiamPersonenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonTimeLimitService,
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: DBiamPersonenkontextService,
                    useValue: createMock(DBiamPersonenkontextService),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
            ],
        }).compile();
        sut = module.get(PersonTimeLimitService);
        personRepoMock = module.get(PersonRepository);
        dBiamPersonenkontextServiceMock = module.get(DBiamPersonenkontextService);
        dBiamPersonenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('getPersonTimeLimitInfo', () => {
        it('should return PersonTimeLimitInfo array', async () => {
            const person: Person<true> = DoFactory.createPerson(true, { orgUnassignmentDate: new Date('2024-01-01') });
            person.personalnummer = undefined;
            personRepoMock.findById.mockResolvedValue(person);

            const pesonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
            dBiamPersonenkontextServiceMock.getKopersPersonenkontexte.mockResolvedValue([pesonenkontext]);
            dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([pesonenkontext]);

            const org: Organisation<true> = DoFactory.createOrganisation(true, { name: 'Testschule' });
            const rolle: Rolle<true> = DoFactory.createRolle(true, { name: 'Testrolle' });

            const kontextExpiresDate: Date = new Date();
            kontextExpiresDate.setDate(kontextExpiresDate.getDate() + KONTEXT_EXPIRES_IN_DAYS - 1);
            const expriringPersonenKontext: Personenkontext<true> = DoFactory.createPersonenkontext(true, {
                befristung: kontextExpiresDate,
                organisationId: org.id,
                getOrganisation: () => Promise.resolve(org),
                getRolle: () => Promise.resolve(rolle),
            });
            dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue([expriringPersonenKontext]);

            const result: PersonTimeLimitInfo[] = await sut.getPersonTimeLimitInfo(person.id);

            const expectedKopersDeadline: Date = new Date(pesonenkontext.createdAt);
            expectedKopersDeadline.setDate(expectedKopersDeadline.getDate() + KOPERS_DEADLINE_IN_DAYS);

            const expectedNoKontexteDeadline: Date = new Date(person.orgUnassignmentDate!);
            expectedNoKontexteDeadline.setDate(expectedNoKontexteDeadline.getDate() + NO_KONTEXTE_DEADLINE_IN_DAYS);

            expect(result[0]).toEqual(
                expect.objectContaining({
                    occasion: TimeLimitOccasion.KOPERS,
                    deadline: expectedKopersDeadline,
                }),
            );
            expect(result[1]).toEqual(
                expect.objectContaining({
                    occasion: TimeLimitOccasion.NO_KONTEXTE,
                    deadline: expectedNoKontexteDeadline,
                }),
            );
            expect(result[2]).toEqual(
                expect.objectContaining({
                    occasion: TimeLimitOccasion.PERSONENKONTEXT_EXPIRES,
                    deadline: kontextExpiresDate,
                    school: 'Testschule',
                    rolle: 'Testrolle',
                }),
            );
        });

        it.each([
            {
                personenkontextDates: ['2021-01-02', '2021-01-01'],
                expectedDate: '2021-01-01',
            },
            {
                personenkontextDates: ['2021-01-01', '2021-01-02'],
                expectedDate: '2021-01-01',
            },
        ])(
            'should return PersonTimeLimitInfo array with earliest Koperslock',
            async ({
                personenkontextDates,
                expectedDate,
            }: {
                personenkontextDates: string[];
                expectedDate: string;
            }) => {
                const person: Person<true> = DoFactory.createPerson(true);
                person.personalnummer = undefined;
                personRepoMock.findById.mockResolvedValue(person);

                const personenkontexte: Personenkontext<true>[] = personenkontextDates.map((date: string) =>
                    DoFactory.createPersonenkontext(true, { createdAt: new Date(date), befristung: undefined }),
                );
                dBiamPersonenkontextServiceMock.getKopersPersonenkontexte.mockResolvedValue(personenkontexte);
                dBiamPersonenkontextRepoMock.findByPerson.mockResolvedValue(personenkontexte);

                const result: PersonTimeLimitInfo[] = await sut.getPersonTimeLimitInfo(person.id);

                const expectedDeadline: Date = new Date(expectedDate);
                expectedDeadline.setDate(expectedDeadline.getDate() + KOPERS_DEADLINE_IN_DAYS);

                expect(result).toEqual<PersonTimeLimitInfo[]>([
                    {
                        occasion: TimeLimitOccasion.KOPERS,
                        deadline: expectedDeadline,
                    },
                ]);
            },
        );

        it('should return empty array when person isnt found ', async () => {
            personRepoMock.findById.mockResolvedValue(null);
            const result: PersonTimeLimitInfo[] = await sut.getPersonTimeLimitInfo('');

            expect(result).toEqual<PersonTimeLimitInfo[]>([]);
        });
    });
});
