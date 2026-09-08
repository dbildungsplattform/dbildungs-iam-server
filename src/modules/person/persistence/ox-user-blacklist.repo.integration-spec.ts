import { faker } from '@faker-js/faker';
import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Test, TestingModule } from '@nestjs/testing';
import { createMock } from '../../../../test/utils/createMock.js';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DEFAULT_TIMEOUT_FOR_TESTCONTAINERS,
} from '../../../../test/utils/index.js';
import { ClassLogger } from '../../../core/logging/class-logger.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../../shared/error/entity-not-found.error.js';
import { OXEmail, OXUserName } from '../../../shared/types/ox-ids.types.js';
import { OxUserBlacklistEntry } from '../domain/ox-user-blacklist-entry.js';
import { OxUserBlacklistEntity } from './ox-user-blacklist.entity.js';
import { mapAggregateToData, OxUserBlacklistRepo } from './ox-user-blacklist.repo.js';

describe('OxUserBlacklistRepo', () => {
    let module: TestingModule;
    let sut: OxUserBlacklistRepo;
    let orm: MikroORM;
    let em: EntityManager;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: true })],
            providers: [
                OxUserBlacklistRepo,
                {
                    provide: ClassLogger,
                    useValue: createMock(ClassLogger),
                },
            ],
        }).compile();
        sut = module.get(OxUserBlacklistRepo);
        orm = module.get(MikroORM);
        em = module.get(EntityManager);

        await DatabaseTestModule.setupDatabase(orm);
    }, DEFAULT_TIMEOUT_FOR_TESTCONTAINERS);

    async function createEntity(email?: OXEmail, name?: string, username?: OXUserName): Promise<void> {
        const oxUserBlacklistEntity: OxUserBlacklistEntity = new OxUserBlacklistEntity();
        oxUserBlacklistEntity.email = email ?? faker.internet.email();
        oxUserBlacklistEntity.name = name ?? faker.person.lastName();
        oxUserBlacklistEntity.username = username ?? faker.internet.username();
        await em.persist(oxUserBlacklistEntity).flush();
    }

    async function createOxUserBlacklistEntry(
        email?: OXEmail,
        name?: string,
        username?: OXUserName,
    ): Promise<OxUserBlacklistEntity> {
        const oxUserBlacklistEntry: OxUserBlacklistEntry<false> = OxUserBlacklistEntry.createNew(
            email ?? faker.internet.email(),
            name ?? faker.person.lastName(),
            username ?? faker.internet.username(),
        );
        const mappedOxUserBlacklistEntity: OxUserBlacklistEntity = em.create(
            OxUserBlacklistEntity,
            mapAggregateToData(oxUserBlacklistEntry),
        );
        await em.persist(mappedOxUserBlacklistEntity).flush();

        return mappedOxUserBlacklistEntity;
    }

    afterAll(async () => {
        await module.close();
    });

    beforeEach(async () => {
        await DatabaseTestModule.clearDatabase(orm);
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('findByEmail', () => {
        describe('when entity can be found by email', () => {
            it('should return OxUserBlacklistEntry', async () => {
                const fakeEmail: OXEmail = faker.internet.email();
                await createEntity(fakeEmail);

                const findResult: Option<OxUserBlacklistEntry<true>> = await sut.findByEmail(fakeEmail);

                if (!findResult) {
                    throw Error();
                }
                expect(findResult.email).toStrictEqual(fakeEmail);
            });
        });

        describe('when entity CANNOT be found by email', () => {
            it('should return null', async () => {
                const findResult: Option<OxUserBlacklistEntry<true>> = await sut.findByEmail(faker.internet.email());

                expect(findResult).toBeNull();
            });
        });
    });

    describe('findByOxUsername', () => {
        describe('when entity can be found by username', () => {
            it('should return OxUserBlacklistEntry', async () => {
                const fakeUsername: OXUserName = faker.internet.username();
                await createEntity(undefined, undefined, fakeUsername);

                const findResult: Option<OxUserBlacklistEntry<true>> = await sut.findByOxUsername(fakeUsername);

                if (!findResult) {
                    throw Error();
                }
                expect(findResult.username).toStrictEqual(fakeUsername);
            });
        });

        describe('when entity CANNOT be found by username', () => {
            it('should return null', async () => {
                const findResult: Option<OxUserBlacklistEntry<true>> = await sut.findByOxUsername(
                    faker.internet.username(),
                );

                expect(findResult).toBeNull();
            });
        });
    });

    describe('save', () => {
        beforeEach(() => {
            vi.restoreAllMocks();
        });
        describe('when OxUserBlacklistEntry has an id and can be found', () => {
            it('should call the update method and return the updated OxUserBlacklistEntry', async () => {
                const existingEntity: OxUserBlacklistEntity = await createOxUserBlacklistEntry();
                const updatedEmail: OXEmail = faker.internet.email();
                const updatedName: string = faker.person.lastName();
                const updatedUsername: OXUserName = faker.internet.username();

                const updatedEntry: OxUserBlacklistEntry<true> = OxUserBlacklistEntry.construct(
                    existingEntity.id,
                    existingEntity.createdAt,
                    existingEntity.updatedAt,
                    updatedEmail,
                    updatedName,
                    updatedUsername,
                );

                const result: OxUserBlacklistEntry<true> | DomainError = await sut.save(updatedEntry);
                if (result instanceof DomainError) {
                    throw Error();
                }

                const foundOxUserBlacklistEntity: Option<OxUserBlacklistEntity> = await em.findOne(
                    OxUserBlacklistEntity,
                    {
                        id: existingEntity.id,
                    },
                );
                if (!foundOxUserBlacklistEntity) {
                    throw Error();
                }

                expect(foundOxUserBlacklistEntity.id).toStrictEqual(existingEntity.id);
                expect(foundOxUserBlacklistEntity.email).toStrictEqual(updatedEmail);
                expect(foundOxUserBlacklistEntity.name).toStrictEqual(updatedName);
                expect(foundOxUserBlacklistEntity.username).toStrictEqual(updatedUsername);
            });
        });

        describe('when OxUserBlacklistEntry has an id and CANNOT be found', () => {
            it('should call the update method and return EntityNotFoundError', async () => {
                const updatedEmail: OXEmail = faker.internet.email();
                const updatedName: string = faker.person.lastName();
                const updatedUsername: OXUserName = faker.internet.username();

                const updatedEntry: OxUserBlacklistEntry<true> = OxUserBlacklistEntry.construct(
                    faker.string.uuid(),
                    faker.date.past(),
                    faker.date.recent(),
                    updatedEmail,
                    updatedName,
                    updatedUsername,
                );

                const result: OxUserBlacklistEntry<true> | DomainError = await sut.save(updatedEntry);
                if (result instanceof OxUserBlacklistEntry) {
                    throw Error();
                }

                expect(result).toStrictEqual(new EntityNotFoundError('OxUserBlacklistEntity'));
            });
        });

        describe('when OxUserBlacklistEntry does not have an id', () => {
            it('should call the create method and return the created OxUserBlacklistEntry', async () => {
                const newEmail: OXEmail = faker.internet.email();
                const newName: string = faker.person.lastName();
                const newUsername: OXUserName = faker.internet.username();
                const newEntry: OxUserBlacklistEntry<false> = OxUserBlacklistEntry.createNew(
                    newEmail,
                    newName,
                    newUsername,
                );

                const result: OxUserBlacklistEntry<true> | DomainError = await sut.save(newEntry);
                if (result instanceof DomainError) {
                    throw Error();
                }

                const foundOxUserBlacklistEntity: Option<OxUserBlacklistEntity> = await em.findOne(
                    OxUserBlacklistEntity,
                    {
                        email: newEmail,
                    },
                );
                if (!foundOxUserBlacklistEntity) {
                    throw Error();
                }

                expect(foundOxUserBlacklistEntity.email).toStrictEqual(newEmail);
                expect(foundOxUserBlacklistEntity.name).toStrictEqual(newName);
                expect(foundOxUserBlacklistEntity.username).toStrictEqual(newUsername);
            });
        });
    });
});
