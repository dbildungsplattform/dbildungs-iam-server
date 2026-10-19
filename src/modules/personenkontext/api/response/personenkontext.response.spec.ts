import { type PersonenkontextResponse } from './personenkontext.response.js';
import { LoeschungResponse } from '../../../person/api/loeschung.response.js';

import { Personenkontext } from '../../domain/personenkontext.js';

import { PersonRepository } from '../../../person/persistence/person.repository.js';
import { OrganisationRepository } from '../../../organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../../../rolle/repo/rolle.repo.js';
import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { PersonApiMapper } from '../../../person/mapper/person-api.mapper.js';
import { type Rolle } from '../../../rolle/domain/rolle.js';
import { faker } from '@faker-js/faker';

describe('PersonenkontextResponse', () => {
    let module: TestingModule;

    let personApiMapper: PersonApiMapper;
    let personRepoMock: DeepMocked<PersonRepository>;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let persistedRolle: Rolle<true>;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [
                PersonApiMapper,
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
            ],
        }).compile();

        personApiMapper = module.get(PersonApiMapper);
        personRepoMock = module.get(PersonRepository);
        organisationRepoMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
    });

    beforeEach(() => {
        vi.resetAllMocks();
        persistedRolle = DoFactory.createRolle(true);
        rolleRepoMock.save.mockResolvedValueOnce(persistedRolle);
    });

    describe('constructor', () => {
        describe('when setting loeschung prop', () => {
            it('should create instance of LoeschungResponse', async () => {
                // Arrange
                const loeschungZeitpunkt: Date = new Date();
                const personenkontext: Personenkontext<true> = Personenkontext.construct(
                    personRepoMock,
                    organisationRepoMock,
                    rolleRepoMock,
                    faker.string.uuid(),
                    new Date(),
                    new Date(),
                    faker.string.uuid(),
                    persistedRolle.id,
                    faker.string.uuid(),
                    '1',
                    faker.string.uuid(),
                    undefined,
                    undefined,
                    undefined,
                    loeschungZeitpunkt,
                    undefined,
                );

                // Act
                const result: PersonenkontextResponse =
                    await personApiMapper.mapToPersonenkontextResponse(personenkontext);
                // Assert
                expect(result.loeschung).toBeInstanceOf(LoeschungResponse);
            });
        });

        describe('when setting loeschung prop to undefined', () => {
            it('should not create instance of LoeschungResponse when loeschungZeitpunkt is undefined', async () => {
                // Arrage
                const loeschungZeitpunkt: Date | undefined = undefined;
                const personenkontext: Personenkontext<true> = Personenkontext.construct(
                    personRepoMock,
                    organisationRepoMock,
                    rolleRepoMock,
                    faker.string.uuid(),
                    new Date(),
                    new Date(),
                    faker.string.uuid(),
                    persistedRolle.id,
                    faker.string.uuid(),
                    '1',
                    faker.string.uuid(),
                    undefined,
                    undefined,
                    undefined,
                    loeschungZeitpunkt,
                    undefined,
                );

                // Act
                const result: PersonenkontextResponse =
                    await personApiMapper.mapToPersonenkontextResponse(personenkontext);

                // Assert
                expect(result.loeschung).toBeUndefined();
            });
        });
    });
});
