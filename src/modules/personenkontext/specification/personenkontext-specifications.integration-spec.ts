import { Test, TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import {
    ConfigTestModule,
    DatabaseTestModule,
    DoFactory,
    KeycloakConfigTestModule,
    LoggingTestModule,
} from '../../../../test/utils/index.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { Personenkontext } from '../domain/personenkontext.js';

import { faker } from '@faker-js/faker';
import { MikroORM } from '@mikro-orm/core';
import { createMock, DeepMocked } from '../../../../test/utils/createMock.js';
import { EventRoutingLegacyKafkaService } from '../../../core/eventbus/services/event-routing-legacy-kafka.service.js';
import { DomainError } from '../../../shared/error/domain.error.js';
import { EmailMicroserviceModule } from '../../email-microservice/email-microservice.module.js';
import { EmailPersistenceModule } from '../../email/email-persistence.module.js';
import { EmailRepo } from '../../email/persistence/email.repo.js';
import { KeycloakAdministrationModule } from '../../keycloak-administration/keycloak-administration.module.js';
import { KeycloakConfigModule } from '../../keycloak-administration/keycloak-config.module.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonFactory } from '../../person/domain/person.factory.js';
import { Person } from '../../person/domain/person.js';
import { UsernameGeneratorService } from '../../person/domain/username-generator.service.js';
import { OxUserBlacklistRepo } from '../../person/persistence/ox-user-blacklist.repo.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { PersonenkontextFactory } from '../domain/personenkontext.factory.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { GleicheRolleAnKlasseWieSchule } from './gleiche-rolle-an-klasse-wie-schule.js';

// TODO fix integration test
// This is not a proper integration test, because most of the repositories are mocked.
// I changed this test from jest to vitest, but the test itself needs a refactoring to become a real integration test.

function createPersonenkontext<WasPersisted extends boolean>(
    this: void,
    personenkontextFactory: PersonenkontextFactory,
    withId: WasPersisted,
    params: Partial<Personenkontext<boolean>> = {},
): Personenkontext<WasPersisted> {
    const personenkontext: Personenkontext<WasPersisted> = personenkontextFactory.construct<boolean>(
        withId ? faker.string.uuid() : undefined,
        withId ? faker.date.past() : undefined,
        withId ? faker.date.recent() : undefined,
        undefined,
        faker.string.uuid(),
        faker.string.uuid(),
        faker.string.uuid(),
    );

    Object.assign(personenkontext, params);

    return personenkontext;
}

describe('PersonenkontextSpecifications Integration', () => {
    let module: TestingModule;
    let orm: MikroORM;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;

    let personFactory: PersonFactory;
    let personRepo: PersonRepository;

    let personenkontextFactory: PersonenkontextFactory;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigTestModule,
                DatabaseTestModule.forRoot({ isDatabaseRequired: true }),
                KeycloakAdministrationModule,
                LoggingTestModule,
                EmailPersistenceModule,
                EmailMicroserviceModule,
            ],
            providers: [
                PersonRepository,
                PersonFactory,
                UsernameGeneratorService,
                OxUserBlacklistRepo,
                PersonenkontextFactory,
                {
                    provide: EmailRepo,
                    useValue: createMock(EmailRepo),
                },
                {
                    provide: EventRoutingLegacyKafkaService,
                    useValue: createMock(EventRoutingLegacyKafkaService),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
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
        })
            .overrideModule(KeycloakConfigModule)
            .useModule(KeycloakConfigTestModule.forRoot({ isKeycloakRequired: true }))
            .overrideProvider(DBiamPersonenkontextRepo)
            .useValue(createMock(DBiamPersonenkontextRepo))
            .overrideProvider(OrganisationRepository)
            .useValue(createMock(OrganisationRepository))
            .overrideProvider(RolleRepo)
            .useValue(createMock(RolleRepo))
            .compile();
        organisationRepoMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personFactory = module.get(PersonFactory);
        personenkontextFactory = module.get(PersonenkontextFactory);
        personRepo = module.get(PersonRepository);
        personenkontextFactory = module.get(PersonenkontextFactory);
        orm = module.get(MikroORM);

        await DatabaseTestModule.setupDatabase(orm);
    }, 10000000);

    beforeEach(async () => {
        vi.resetAllMocks();
        await DatabaseTestModule.clearDatabase(orm);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(module).toBeDefined();
    });

    describe('Gleiche Rolle An Klasse Wie Schule', () => {
        it('should not be satisfied when rolle could not be found', async () => {
            const klasse: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE });
            const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
            klasse.administriertVon = schule.id;
            const specification: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
                organisationRepoMock,
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personResult: Person<false> | DomainError = await personFactory.createNew({
                vorname: faker.person.firstName(),
                familienname: faker.person.lastName(),
            });
            if (personResult instanceof DomainError) {
                throw personResult;
            }
            const person: Person<true> | DomainError = await personRepo.create(personResult);
            if (person instanceof DomainError) {
                throw person;
            }
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false, {
                personId: person.id,
            });
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([
                DoFactory.createPersonenkontext(true, {
                    organisationId: schule.id,
                    personId: person.id,
                    rolleId: faker.string.uuid(),
                }),
            ]);

            organisationRepoMock.findById.mockResolvedValueOnce(klasse); //mock Klasse
            organisationRepoMock.findById.mockResolvedValueOnce(schule); //mock Schule

            rolleRepoMock.findById.mockResolvedValueOnce(undefined);

            expect(await specification.isSatisfiedBy(personenkontext)).toBeFalsy();
        });
    });
});
