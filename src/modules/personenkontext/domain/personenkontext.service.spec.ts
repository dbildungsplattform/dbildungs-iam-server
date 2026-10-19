import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { type Paged } from '../../../shared/paging/paged.js';
import { PersonenkontextService } from './personenkontext.service.js';
import { MismatchedRevisionError } from '../../../shared/error/mismatched-revision.error.js';
import { EntityCouldNotBeDeleted } from '../../../shared/error/index.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { DBiamPersonenkontextRepoInternal } from '../persistence/internal-dbiam-personenkontext.repo.js';
import { type Personenkontext } from './personenkontext.js';
import { faker } from '@faker-js/faker';
import { PersonenkontextFactory } from './personenkontext.factory.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonenkontextQueryParams } from '../api/param/personenkontext-query.params.js';

describe('PersonenkontextService', () => {
    let module: TestingModule;
    let personenkontextService: PersonenkontextService;
    let dbiamPersonenKontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;
    let dbiamPersonenKontextRepoInternalMock: DeepMocked<DBiamPersonenkontextRepoInternal>;

    let personenkontextFactory: PersonenkontextFactory;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonenkontextService,
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
                {
                    provide: DBiamPersonenkontextRepoInternal,
                    useValue: createMock(DBiamPersonenkontextRepoInternal),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
            ],
        }).compile();
        personenkontextService = module.get(PersonenkontextService);
        dbiamPersonenKontextRepoMock = module.get(DBiamPersonenkontextRepo);
        dbiamPersonenKontextRepoInternalMock = module.get(DBiamPersonenkontextRepoInternal);
        personenkontextFactory = module.get(PersonenkontextFactory);
        personenkontextFactory = module.get(PersonenkontextFactory);
    });

    afterAll(async () => {
        await module.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should be defined', () => {
        expect(personenkontextService).toBeDefined();
    });

    describe('findAllPersonenkontexte', () => {
        describe('When personenkontexte are found', () => {
            it('should get all personenkontexte that match', async () => {
                const personenkontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false);
                const personenkontext2: Personenkontext<false> = DoFactory.createPersonenkontext(false);
                const personenkontexte: Personenkontext<true>[] = [
                    personenkontext1 as unknown as Personenkontext<true>,
                    personenkontext2 as unknown as Personenkontext<true>,
                ];
                dbiamPersonenKontextRepoMock.findBy.mockResolvedValue([personenkontexte, personenkontexte.length]);
                const personenkontextDoWithQueryParam: PersonenkontextQueryParams = new PersonenkontextQueryParams();

                const result: Paged<Personenkontext<true>> = await personenkontextService.findAllPersonenkontexte(
                    personenkontextDoWithQueryParam,
                );

                expect(result).toEqual<Paged<Personenkontext<true>>>({
                    items: personenkontexte,
                    total: personenkontexte.length,
                    offset: 0,
                    limit: personenkontexte.length,
                });
            });
        });

        describe('When no personenkontexte are found', () => {
            it('should return a result with an empty array', async () => {
                dbiamPersonenKontextRepoMock.findBy.mockResolvedValue([[], 0]);

                const result: Paged<Personenkontext<true>> = await personenkontextService.findAllPersonenkontexte(
                    new PersonenkontextQueryParams(),
                );

                expect(result).toEqual<Paged<Personenkontext<true>>>({
                    items: [],
                    total: 0,
                    offset: 0,
                    limit: 0,
                });
            });
        });
    });

    describe('findPersonenkontextById', () => {
        describe('when finding personenkontext with given id', () => {
            it('should return found personenkontext', async () => {
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);

                dbiamPersonenKontextRepoMock.findByID.mockResolvedValue(personenkontext);

                const result: Result<
                    Personenkontext<true>,
                    DomainError
                > = await personenkontextService.findPersonenkontextById(personenkontext.id);

                expect(result).toStrictEqual({ ok: true, value: personenkontext });
            });
        });

        describe('when NOT finding personenkontext with given id', () => {
            it('should return domain error', async () => {
                const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);

                dbiamPersonenKontextRepoMock.findByID.mockResolvedValue(null);

                const result: Result<
                    Personenkontext<true>,
                    DomainError
                > = await personenkontextService.findPersonenkontextById(personenkontext.id);

                expect(result).toStrictEqual({
                    ok: false,
                    error: new EntityNotFoundError('Personenkontext', personenkontext.id),
                });
            });
        });
    });

    describe('findPersonenkontexteByPersonId', () => {
        describe('when finding personenkontext via personId', () => {
            it('should return found personenkontext', async () => {
                const personenkontexte: Personenkontext<true>[] = [
                    personenkontextFactory.construct('1', faker.date.past(), faker.date.recent(), '', '1', '1', '1'),
                ];
                dbiamPersonenKontextRepoMock.findByPerson.mockResolvedValue(personenkontexte);
                expect(await personenkontextService.findPersonenkontexteByPersonId('1')).toHaveLength(1);
            });
        });
    });

    describe('deletePersonenkontextById', () => {
        const personenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);

        describe('when personenkontext is deleted successfully', () => {
            it('should return void', async () => {
                dbiamPersonenKontextRepoMock.findByID.mockResolvedValue(personenkontext);
                dbiamPersonenKontextRepoInternalMock.deleteById.mockResolvedValue(true);

                const result: Result<void, DomainError> = await personenkontextService.deletePersonenkontextById(
                    personenkontext.id,
                    personenkontext.revision,
                );

                expect(result).toEqual<Result<void, DomainError>>({ ok: true, value: undefined });
            });
        });

        describe('when personenkontext entity is not found', () => {
            it('should return EntityNotFoundError', async () => {
                dbiamPersonenKontextRepoMock.findByID.mockResolvedValue(null);

                const response: Result<void, DomainError> = await personenkontextService.deletePersonenkontextById(
                    personenkontext.id,
                    personenkontext.revision,
                );

                expect(response).toEqual<Result<void, DomainError>>({
                    ok: false,
                    error: new EntityNotFoundError('Personenkontext', personenkontext.id),
                });
            });
        });

        describe('when revision of personenkontext does not match', () => {
            it('should return MismatchedRevisionError', async () => {
                // AI next 11 lines
                dbiamPersonenKontextRepoMock.findByID.mockResolvedValue(personenkontext);

                const result: Result<void, DomainError> = await personenkontextService.deletePersonenkontextById(
                    personenkontext.id,
                    '2',
                );

                expect(result).toEqual<Result<void, DomainError>>({
                    ok: false,
                    error: new MismatchedRevisionError('Personenkontext'),
                });
            });
        });

        describe('when personenkontext could not be deleted', () => {
            it('should return EntityCouldNotBeDeleted', async () => {
                // AI next 11 lines
                dbiamPersonenKontextRepoMock.findByID.mockResolvedValue(personenkontext);
                dbiamPersonenKontextRepoInternalMock.deleteById.mockResolvedValue(false);

                const response: Result<void, DomainError> = await personenkontextService.deletePersonenkontextById(
                    personenkontext.id,
                    personenkontext.revision,
                );

                expect(response).toEqual<Result<void, DomainError>>({
                    ok: false,
                    error: new EntityCouldNotBeDeleted('Personenkontext', personenkontext.id),
                });
            });
        });
    });
});
