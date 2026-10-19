import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { EntityNotFoundError } from '../../../shared/error/index.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { PersonService } from './person.service.js';
import { type Paged } from '../../../shared/paging/index.js';
import { type Person } from './person.js';
import { PersonRepository } from '../persistence/person.repository.js';

describe('PersonService', () => {
    let module: TestingModule;
    let sut: PersonService;
    let personRepoMock: DeepMocked<PersonRepository>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonService,
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
            ],
        }).compile();
        sut = module.get(PersonService);
        personRepoMock = module.get(PersonRepository);
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

    describe('findPersonById', () => {
        describe('when person exists', () => {
            it('should get a person', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValue(person);
                const result: Result<Person<true>> | Error = await sut.findPersonById(person.id);
                expect(result).toEqual<Result<Person<true>>>({
                    ok: true,
                    value: person,
                });
            });
        });

        describe('when person cloud not be found', () => {
            it('should get a EntityNotFoundError error ', async () => {
                const person: Person<true> = DoFactory.createPerson(true);
                personRepoMock.findById.mockResolvedValue(null);
                const result: Result<Person<true>> | Error = await sut.findPersonById(person.id);
                expect(result).toEqual<Result<Person<true>>>({
                    ok: false,
                    error: new EntityNotFoundError('Person', person.id),
                });
            });
        });
    });

    describe('findAllPersons', () => {
        it('should get all persons that match', async () => {
            const firstPerson: Person<true> = DoFactory.createPerson(true);
            const secondPerson: Person<true> = DoFactory.createPerson(true);
            const persons: Counted<Person<true>> = [[firstPerson, secondPerson], 2];

            personRepoMock.findBy.mockResolvedValue(persons);

            const personDoWithQueryParam: Person<false> = DoFactory.createPerson(false);
            const result: Paged<Person<true>> = await sut.findAllPersons(personDoWithQueryParam, 0, 10);

            expect(result.items).toHaveLength(2);
        });

        it('should return an empty list of persons ', async () => {
            const person: Person<false> = DoFactory.createPerson(false);

            personRepoMock.findBy.mockResolvedValue([[], 0]);

            const result: Paged<Person<true>> = await sut.findAllPersons(person);

            expect(result.items).toBeInstanceOf(Array);
            expect(result.items).toHaveLength(0);
        });
    });
});
