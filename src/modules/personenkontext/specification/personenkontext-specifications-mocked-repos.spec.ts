import { Test, type TestingModule } from '@nestjs/testing';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { ConfigTestModule, DatabaseTestModule, DoFactory } from '../../../../test/utils/index.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { NurLehrUndLernAnKlasse } from './nur-lehr-und-lern-an-klasse.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { faker } from '@faker-js/faker';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { GleicheRolleAnKlasseWieSchule } from './gleiche-rolle-an-klasse-wie-schule.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { PersonenkontextFactory } from '../domain/personenkontext.factory.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { PersonRepository } from '../../person/persistence/person.repository.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { CheckRollenartSpecification } from './nur-gleiche-rolle.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';

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

describe('PersonenkontextSpecificationsMockedReposTest', () => {
    let module: TestingModule;
    let organisationRepoMock: DeepMocked<OrganisationRepository>;
    let rolleRepoMock: DeepMocked<RolleRepo>;
    let personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo>;

    let personenkontextFactory: PersonenkontextFactory;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [ConfigTestModule, DatabaseTestModule.forRoot({ isDatabaseRequired: false })],
            providers: [
                PersonenkontextFactory,
                {
                    provide: OrganisationRepository,
                    useValue: createMock(OrganisationRepository),
                },
                {
                    provide: PersonRepository,
                    useValue: createMock(PersonRepository),
                },
                {
                    provide: RolleRepo,
                    useValue: createMock(RolleRepo),
                },
                {
                    provide: DBiamPersonenkontextRepo,
                    useValue: createMock(DBiamPersonenkontextRepo),
                },
                PersonenkontextFactory,
            ],
        }).compile();
        organisationRepoMock = module.get(OrganisationRepository);
        rolleRepoMock = module.get(RolleRepo);
        personenkontextRepoMock = module.get(DBiamPersonenkontextRepo);
        personenkontextFactory = module.get(PersonenkontextFactory);
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

    describe('Nur LEHR Und LERN An Klasse', () => {
        it('should be satisfied when organisation typ is not KLASSE', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.typ = OrganisationsTyp.SCHULE;
            const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(
                organisationRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);
            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            expect(await specification.isSatisfiedBy(personenkontext)).toBeTruthy();
        });

        it('should not be satisfied when organisation could not be found', async () => {
            const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(
                organisationRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);
            organisationRepoMock.findById.mockResolvedValueOnce(undefined);
            expect(await specification.isSatisfiedBy(personenkontext)).toBeFalsy();
        });

        it('should not be satisfied when rolle could not be found', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.typ = OrganisationsTyp.KLASSE;
            const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(
                organisationRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);
            rolleRepoMock.findById.mockResolvedValueOnce(undefined);

            expect(await specification.isSatisfiedBy(personenkontext)).toBeFalsy();
        });
    });

    describe('Gleiche Rolle An Klasse Wie Schule', () => {
        it('should be satisfied when organisation type is not KLASSE', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.typ = OrganisationsTyp.SCHULE;
            const specification: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
                organisationRepoMock,
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);
            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            expect(await specification.isSatisfiedBy(personenkontext)).toBeTruthy();
        });

        it('should not be satisfied when organisation could not be found', async () => {
            const specification: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
                organisationRepoMock,
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);
            organisationRepoMock.findById.mockResolvedValueOnce(undefined);
            expect(await specification.isSatisfiedBy(personenkontext)).toBeFalsy();
        });

        it('should not be satisfied when organisation type is KLASSE but not administriertVon', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.typ = OrganisationsTyp.KLASSE;
            organisation.administriertVon = undefined;
            const specification: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
                organisationRepoMock,
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);
            organisationRepoMock.findById.mockResolvedValueOnce(organisation);

            expect(await specification.isSatisfiedBy(personenkontext)).toBeFalsy();
        });

        it('should not be satisfied when rolle could not be found', async () => {
            const klasse: Organisation<true> = DoFactory.createOrganisation(true);
            klasse.typ = OrganisationsTyp.KLASSE;
            const schule: Organisation<true> = DoFactory.createOrganisation(true);
            schule.typ = OrganisationsTyp.SCHULE;
            klasse.administriertVon = schule.id;
            const specification: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
                organisationRepoMock,
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);
            const foundPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);
            schule.id = foundPersonenkontext.organisationId;
            const foundPersonenkontexte: Personenkontext<true>[] = [foundPersonenkontext];

            organisationRepoMock.findById.mockResolvedValueOnce(klasse); //mock Klasse
            organisationRepoMock.findById.mockResolvedValueOnce(schule); //mock Schule

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce(foundPersonenkontexte);
            rolleRepoMock.findById.mockResolvedValueOnce(undefined);

            expect(await specification.isSatisfiedBy(personenkontext)).toBeFalsy();
        });

        it('should not be satisfied when rolle objects are not identical', async () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true);
            organisation.typ = OrganisationsTyp.KLASSE;
            const rolle: Rolle<true> = DoFactory.createRolle(true);
            const specification: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
                organisationRepoMock,
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = createPersonenkontext(personenkontextFactory, false);

            organisationRepoMock.findById.mockResolvedValueOnce(organisation);
            rolleRepoMock.findById.mockResolvedValueOnce(rolle);

            expect(await specification.isSatisfiedBy(personenkontext)).toBeFalsy();
        });
    });
    describe('Nur Lern kontext when person has LERN kontexte already', () => {
        it('should pass the check when there are no existing roles', async () => {
            const specification: CheckRollenartSpecification = new CheckRollenartSpecification(
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);
            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map()); // No existing roles

            const mapRollen: Map<string, Rolle<true>> = new Map();
            mapRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(mapRollen); // sent roles

            const result: boolean = await specification.checkRollenart([personenkontext]);

            expect(result).toBe(true);
        });

        it('should pass the check when new roles match existing role type', async () => {
            const specification: CheckRollenartSpecification = new CheckRollenartSpecification(
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const existingPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([existingPersonenkontext]);

            const existingRollen: Map<string, Rolle<true>> = new Map();
            existingRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(existingRollen);

            const newRollen: Map<string, Rolle<true>> = new Map();
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(newRollen);

            const result: boolean = await specification.checkRollenart([personenkontext]);

            expect(result).toBe(true);
        });

        it('should fail the check when new roles do not match existing role type', async () => {
            const specification: CheckRollenartSpecification = new CheckRollenartSpecification(
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const existingPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([existingPersonenkontext]);

            const existingRollen: Map<string, Rolle<true>> = new Map();
            existingRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(existingRollen);

            const newRollen: Map<string, Rolle<true>> = new Map();
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(newRollen);

            const result: boolean = await specification.checkRollenart([personenkontext]);

            expect(result).toBe(false);
        });

        it('should pass the check when multiple new roles all match existing role type', async () => {
            const specification: CheckRollenartSpecification = new CheckRollenartSpecification(
                personenkontextRepoMock,
                rolleRepoMock,
            );
            const personenkontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const personenkontext2: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const existingPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([existingPersonenkontext]);

            const existingRollen: Map<string, Rolle<true>> = new Map();
            existingRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(existingRollen);

            const newRollen: Map<string, Rolle<true>> = new Map();
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(newRollen);

            const result: boolean = await specification.checkRollenart([personenkontext1, personenkontext2]);

            expect(result).toBe(true);
        });

        it('should pass the check when multiple new roles all match existing role type and no existing roles', async () => {
            const specification: CheckRollenartSpecification = new CheckRollenartSpecification(
                personenkontextRepoMock,
                rolleRepoMock,
            );

            const personenkontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const personenkontext2: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const existingPersonenkontext: Personenkontext<true> = DoFactory.createPersonenkontext(true);

            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([existingPersonenkontext]);

            const existingRollen: Map<string, Rolle<true>> = new Map();
            rolleRepoMock.findByIds.mockResolvedValueOnce(existingRollen);

            const newRollen: Map<string, Rolle<true>> = new Map();
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(newRollen);

            const result: boolean = await specification.checkRollenart([personenkontext1, personenkontext2]);

            expect(result).toBe(true);
        });

        it('should fail the check when new roles have different role types and no existing roles', async () => {
            const specification: CheckRollenartSpecification = new CheckRollenartSpecification(
                personenkontextRepoMock,
                rolleRepoMock,
            );

            const personenkontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const personenkontext2: Personenkontext<false> = DoFactory.createPersonenkontext(false);

            // Mock to return an empty array for existing person contexts
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);

            // Mock for existing roles, which will be empty
            const existingRollen: Map<string, Rolle<true>> = new Map();
            rolleRepoMock.findByIds.mockResolvedValueOnce(existingRollen);

            // Mock new roles with different role types
            const newRollen: Map<string, Rolle<true>> = new Map();
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LERN })); // Different role type
            rolleRepoMock.findByIds.mockResolvedValueOnce(newRollen);

            const result: boolean = await specification.checkRollenart([personenkontext1, personenkontext2]);

            expect(result).toBe(false); // Expecting false because of different role types
        });

        it('should throw an error when existingRollen has undefined values', async () => {
            const specification: CheckRollenartSpecification = new CheckRollenartSpecification(
                personenkontextRepoMock,
                rolleRepoMock,
            );

            const personenkontext1: Personenkontext<false> = DoFactory.createPersonenkontext(false);
            const personenkontext2: Personenkontext<false> = DoFactory.createPersonenkontext(false);

            // Mock to return an empty array for existing person contexts
            personenkontextRepoMock.findByPerson.mockResolvedValueOnce([]);

            // Instead of mocking the map with 'undefined', we simulate the function returning an invalid array (empty or undefined)
            const existingRollen: Rolle<true>[] = [undefined as unknown as Rolle<true>]; // Simulating undefined role
            rolleRepoMock.findByIds.mockResolvedValueOnce(new Map(Object.entries(existingRollen)));

            // Mock new roles with valid role types
            const newRollen: Map<string, Rolle<true>> = new Map();
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            newRollen.set(faker.string.uuid(), DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));
            rolleRepoMock.findByIds.mockResolvedValueOnce(newRollen);

            // Expect the function to throw an error due to the undefined value in existingRollen
            await expect(specification.checkRollenart([personenkontext1, personenkontext2])).rejects.toThrow(
                'Expected existingRollen to contain valid roles, but found undefined.',
            );
        });
    });
});
