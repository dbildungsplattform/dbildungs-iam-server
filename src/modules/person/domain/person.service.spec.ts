import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { EntityNotFoundError, MissingPermissionsError } from '../../../shared/error/index.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { PersonService } from './person.service.js';
import { type Paged } from '../../../shared/paging/index.js';
import { type Person } from './person.js';
import { type PersonenQueryParams, PersonRepository } from '../persistence/person.repository.js';
import { createPersonPermissionsMock } from '../../../../test/utils/index.js';
import { type PermittedOrgas, type PersonPermissions } from '../../authentication/domain/person-permissions.js';
import { RollenSystemRecht } from '../../rolle/domain/systemrecht.js';
import { PersonLockOccasion } from './person.enums.js';

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

    describe('findPersons', () => {
        it.each<PermittedOrgas>([{ all: true }, { all: false, orgaIds: ['school-id'] }])(
            'should forward filters and restrict the search to permitted organisations: %j',
            async (permittedOrgas: PermittedOrgas) => {
                const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
                permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce(permittedOrgas);
                const queryParams: PersonenQueryParams = {
                    sperrgruende: [PersonLockOccasion.MANUELL_GESPERRT, PersonLockOccasion.KOPERS_GESPERRT],
                    suchFilter: 'Max',
                    rolleIDs: ['role-id'],
                    offset: 5,
                    limit: 10,
                };
                const persons: Counted<Person<true>> = [[DoFactory.createPerson(true)], 1];
                personRepoMock.findPersons.mockResolvedValueOnce(persons);

                const result: Result<Counted<Person<true>>, MissingPermissionsError> = await sut.findPersons(
                    queryParams,
                    permissions,
                );

                expect(result).toEqual({ ok: true, value: persons });
                expect(permissions.getOrgIdsWithSystemrecht).toHaveBeenCalledWith(
                    [RollenSystemRecht.PERSONEN_VERWALTEN],
                    true,
                );
                expect(personRepoMock.findPersons).toHaveBeenCalledExactlyOnceWith(queryParams, permittedOrgas);
            },
        );

        it('should reject searches without permitted organisations', async () => {
            const permissions: DeepMocked<PersonPermissions> = createPersonPermissionsMock();
            permissions.getOrgIdsWithSystemrecht.mockResolvedValueOnce({ all: false, orgaIds: [] });

            const result: Result<Counted<Person<true>>, MissingPermissionsError> = await sut.findPersons(
                {},
                permissions,
            );

            expect(result).toEqual({ ok: false, error: new MissingPermissionsError('NOT_AUTHORIZED') });
            expect(personRepoMock.findPersons).not.toHaveBeenCalled();
        });
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
